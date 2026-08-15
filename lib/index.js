import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { LlmAdapter, ReasoningEffortId, createUserMessage } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
//#region lib/types/presets.js
/** Resolve a display policy to the three role effort values. */
function effortPreset(policy) {
	switch (policy) {
		case "balanced": return {
			planner: "high",
			worker: "high",
			reviewer: "high"
		};
		case "high-quality": return {
			planner: "max",
			worker: "high",
			reviewer: "max"
		};
		case "ultra": return {
			planner: "ultra",
			worker: "ultra",
			reviewer: "ultra"
		};
	}
}
/** Select the strongest supported provider effort for a Captain policy value. */
function compatibleReasoningEffort(requested, supported) {
	if (supported.length === 0) return void 0;
	return (requested === "ultra" ? [
		requested,
		"max",
		"high",
		"medium",
		"low",
		"off"
	] : requested === "max" ? [
		requested,
		"high",
		"medium",
		"low",
		"off"
	] : requested === "high" ? [
		requested,
		"medium",
		"low",
		"off"
	] : [requested, "off"]).find((candidate) => supported.includes(candidate));
}
/** Apply a policy only where a role did not explicitly choose its effort. */
function resolvedRoleRoutes(config) {
	const preset = effortPreset(config.policy);
	const fallback = config.default;
	const route = (candidate, effort) => ({
		provider: candidate.provider || fallback.provider,
		model: candidate.model || fallback.model,
		reasoningEffort: candidate.reasoningEffort || fallback.reasoningEffort || effort
	});
	return {
		planner: route(config.planner, preset.planner),
		worker: route(config.worker, preset.worker),
		reviewer: route(config.reviewer, preset.reviewer)
	};
}
//#endregion
//#region lib/types/diff.js
/** Compute a stable FNV-1a hash without a crypto dependency in the browser-safe projection. */
function diffHash(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
/** Read changes after the checkpoint's recorded HEAD, including staged and working-tree edits. */
async function incrementalDiff(git, checkpoint) {
	const head = (await git.run(["rev-parse", "HEAD"])).trim();
	const range = checkpoint === void 0 ? [
		"diff",
		"--no-ext-diff",
		"--binary",
		"HEAD"
	] : [
		"diff",
		"--no-ext-diff",
		"--binary",
		checkpoint.head
	];
	const patch = await git.run(range);
	return {
		head,
		patch,
		changedFiles: (await git.run(checkpoint === void 0 ? [
			"status",
			"--short",
			"--untracked-files=all"
		] : [
			"diff",
			"--name-only",
			checkpoint.head
		])).split(/\r?\n/).map((line) => line.replace(/^\s*[MADRCU?!]+\s+/, "").trim()).filter(Boolean),
		hash: diffHash(patch)
	};
}
/** Advance the checkpoint only after a reviewer pass. */
function advanceCheckpoint(diff, now = Date.now()) {
	return {
		head: diff.head,
		diffHash: diff.hash,
		changedFiles: [...diff.changedFiles],
		createdAt: now
	};
}
//#endregion
//#region lib/types/reviewer.js
/** Parse a reviewer response without trusting provider prose as control data. */
function parseReview(raw) {
	const candidates = jsonObjects(raw);
	if (candidates.length === 0) return {
		pass: false,
		summary: "Reviewer returned no structured result.",
		findings: [{
			id: "review-format",
			message: raw.trim() || "empty reviewer output",
			files: [],
			severity: "error"
		}]
	};
	for (const candidate of candidates) try {
		const value = JSON.parse(candidate);
		if (!isRecord$1(value) || typeof value.pass !== "boolean" || !Array.isArray(value.findings)) continue;
		const findings = value.findings.flatMap((item, index) => {
			if (!isRecord$1(item) || typeof item.message !== "string") return [];
			const severity = item.severity === "warning" || item.severity === "info" ? item.severity : "error";
			return [{
				id: typeof item.id === "string" ? item.id : `finding-${index + 1}`,
				message: item.message,
				files: Array.isArray(item.files) ? item.files.filter((file) => typeof file === "string") : [],
				severity,
				...typeof item.taskId === "string" ? { taskId: item.taskId } : {}
			}];
		});
		return {
			pass: value.pass && !findings.some((finding) => finding.severity === "error"),
			summary: typeof value.summary === "string" ? value.summary : "",
			findings
		};
	} catch {}
	return {
		pass: false,
		summary: "Reviewer JSON could not be parsed.",
		findings: [{
			id: "review-json",
			message: "Reviewer response was not valid reviewer JSON.",
			files: [],
			severity: "error"
		}]
	};
}
/**
* Whether one malformed provider response merits the single protocol correction retry.
* @param review - Parsed review or parser-generated protocol finding.
* @returns True for a reviewer format failure.
*/
function reviewNeedsRetry(review) {
	return review.findings.some((finding) => finding.id === "review-format" || finding.id === "review-json");
}
/** Select only tasks touched by reviewer findings; an unscoped finding rechecks every task. */
function repairTasks(tasks, review) {
	if (review.pass) return [];
	const ids = new Set(review.findings.flatMap((finding) => finding.taskId === void 0 ? [] : [finding.taskId]));
	if (ids.size === 0) return [...tasks];
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const includeDependencies = (id) => {
		const task = byId.get(id);
		if (task === void 0) return;
		for (const dependency of task.dependsOn) {
			if (ids.has(dependency)) continue;
			ids.add(dependency);
			includeDependencies(dependency);
		}
	};
	for (const id of [...ids]) includeDependencies(id);
	return tasks.filter((task) => ids.has(task.id));
}
/** Render the compact review payload sent to GPT. */
function reviewPrompt(acceptance, workers, patch) {
	return [
		"Review the incremental implementation as an independent code reviewer.",
		"Return JSON only: {\"pass\":boolean,\"summary\":string,\"findings\":[{\"id\":string,\"taskId\":string,\"files\":string[],\"severity\":\"error|warning|info\",\"message\":string}]}",
		"Do not return prose, Markdown, DSML, function calls, or tool calls.",
		`Acceptance criteria:\n${acceptance.join("\n") || "(none)"}`,
		`Worker results:\n${JSON.stringify(workers)}`,
		`Incremental git diff:\n${patch || "(empty)"}`
	].join("\n\n");
}
function jsonObjects(raw) {
	const fenced = [];
	for (const match of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)) if (match[1] !== void 0) fenced.push(...balancedObjects(match[1]));
	const all = balancedObjects(raw);
	return [...new Set([...fenced, ...all])];
}
function balancedObjects(raw) {
	const objects = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = 0; index < raw.length; index += 1) {
		const character = raw[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === "\"") inString = false;
			continue;
		}
		if (character === "\"") {
			inString = true;
			continue;
		}
		if (character === "{") {
			if (depth === 0) start = index;
			depth += 1;
			continue;
		}
		if (character !== "}" || depth === 0) continue;
		depth -= 1;
		if (depth === 0 && start >= 0) {
			objects.push(raw.slice(start, index + 1));
			start = -1;
		}
	}
	return objects;
}
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region lib/types/scheduler.js
/** Build a validated scheduler state. */
function createSchedulerState(config) {
	return {
		completed: /* @__PURE__ */ new Set(),
		running: /* @__PURE__ */ new Set(),
		failed: /* @__PURE__ */ new Set(),
		tokensUsed: 0,
		parallelLimit: limitOf(config)
	};
}
/** Validate DAG ids, dependencies, and ownership metadata before execution. */
function validateTasks(tasks) {
	const ids = /* @__PURE__ */ new Set();
	for (const task of tasks) {
		if (!/^[a-zA-Z0-9_-]+$/.test(task.id)) throw new Error(`Captain task id is invalid: ${task.id}`);
		if (ids.has(task.id)) throw new Error(`Captain task id is duplicated: ${task.id}`);
		ids.add(task.id);
		if (task.prompt.trim() === "") throw new Error(`Captain task ${task.id} has an empty prompt`);
		if (task.files.some((file) => file.trim() === "")) throw new Error(`Captain task ${task.id} has an empty file owner`);
		if (!Number.isFinite(task.tokenBudget) || task.tokenBudget <= 0) throw new Error(`Captain task ${task.id} has an invalid token budget`);
	}
	for (const task of tasks) for (const dependency of task.dependsOn) {
		if (!ids.has(dependency)) throw new Error(`Captain task ${task.id} depends on missing task ${dependency}`);
		if (dependency === task.id) throw new Error(`Captain task ${task.id} cannot depend on itself`);
	}
	const visiting = /* @__PURE__ */ new Set();
	const visited = /* @__PURE__ */ new Set();
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const visit = (id) => {
		if (visited.has(id)) return;
		if (visiting.has(id)) throw new Error(`Captain task dependency cycle includes ${id}`);
		visiting.add(id);
		for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
	};
	for (const task of tasks) visit(task.id);
}
/** Select ready tasks while avoiding concurrent writes to overlapping files. */
function readyTasks(tasks, state) {
	const occupied = new Set(tasks.filter((task) => state.running.has(task.id)).flatMap((task) => task.files));
	return tasks.filter((task) => !state.completed.has(task.id) && !state.failed.has(task.id) && !state.running.has(task.id)).filter((task) => task.dependsOn.every((id) => state.completed.has(id))).filter((task) => task.files.every((file) => !occupied.has(file))).slice(0, state.parallelLimit);
}
/** Mark tasks whose prerequisites failed so a failed branch cannot stall the DAG. */
function settleBlockedTasks(tasks, state) {
	const blocked = [];
	let changed = true;
	while (changed) {
		changed = false;
		for (const task of tasks) {
			if (state.completed.has(task.id) || state.failed.has(task.id) || state.running.has(task.id)) continue;
			if (!task.dependsOn.some((id) => state.failed.has(id))) continue;
			state.failed.add(task.id);
			blocked.push(task);
			changed = true;
		}
	}
	return blocked;
}
/** Reserve a task and account its budget before starting a child. */
function startTask(state, task, config) {
	if (state.running.has(task.id)) throw new Error(`Captain task ${task.id} is already running`);
	if (state.tokensUsed + task.tokenBudget > config.totalTokenBudget) throw new Error(`Captain token budget exceeded before task ${task.id}`);
	state.running.add(task.id);
	state.tokensUsed += task.tokenBudget;
}
/** Settle a task and feed provider pressure back into the parallel limit. */
function finishTask(state, task, observation, config) {
	state.running.delete(task.id);
	if (observation.succeeded === false) state.failed.add(task.id);
	else state.completed.add(task.id);
	if (!config.adaptiveConcurrency) return;
	if (observation.rateLimited || observation.timedOut) state.parallelLimit = Math.max(1, Math.floor(state.parallelLimit / 2));
	else if (observation.succeeded === true) state.parallelLimit = Math.min(limitOf(config), state.parallelLimit + 1);
}
/** Whether the DAG has no remaining executable work. */
function isSettled(tasks, state) {
	return tasks.every((task) => state.completed.has(task.id) || state.failed.has(task.id)) && state.running.size === 0;
}
function limitOf(config) {
	const configured = config.maxParallel > 0 ? config.maxParallel : config.maxAgents;
	return Math.max(1, Math.min(config.maxAgents, configured));
}
//#endregion
//#region lib/types/vision-model.js
/** Rank image-capable models for automatic fallback. */
function visionModelRank(id) {
	if (/(?:^|[-_.])terra(?:$|[-_.])/i.test(id)) return 0;
	if (/(?:^|[-_.])luna(?:$|[-_.])/i.test(id)) return 1;
	return 2;
}
//#endregion
//#region lib/types/vision.js
/** Append images to a user message without changing the text protocol. */
function withImages(message, images) {
	if (message.role !== "user") throw new Error("Captain vision input must be attached to a user message");
	const content = [...message.content];
	for (const image of images) content.push({
		type: "image",
		attachment: image.ref
	});
	return {
		...message,
		content
	};
}
/** Build a nested OpenAI-compatible vision request using the configured Luna/Terra route. */
function visionRequest(route, messages, images) {
	const last = messages.at(-1);
	const next = last === void 0 ? messages : messages.slice(0, -1).concat(withImages(last, images));
	return {
		provider: route.provider,
		model: route.model,
		messages: next
	};
}
/**
* Resolve an image-capable route without sending the original attachment to a text-only planner.
* @param route - User-selected vision route.
* @param models - Models advertised by the selected provider.
* @returns The selected route or a same-provider image route, always using the provider's default effort.
*/
function resolveVisionRoute(route, models) {
	const selected = models.find((model) => model.id === route.model);
	if (selected === void 0 || selected.inputModalities === void 0 || selected.inputModalities.includes("image")) return {
		...route,
		reasoningEffort: ""
	};
	const fallback = models.filter((model) => model.inputModalities?.includes("image") === true).toSorted((left, right) => visionModelRank(left.id) - visionModelRank(right.id))[0];
	if (fallback !== void 0) return {
		provider: route.provider,
		model: fallback.id,
		reasoningEffort: ""
	};
	throw new Error(`Captain vision provider "${route.provider}" has no image-capable model; declare a Luna/Terra model with input: [text, image]`);
}
//#endregion
//#region lib/types/orchestrator.js
/** Host orchestrator for one synthetic Captain request. */
var CaptainOrchestrator = class {
	ctx;
	config;
	llm;
	checkpoint;
	checkpointCwd;
	constructor(ctx, config, llm) {
		this.ctx = ctx;
		this.config = config;
		this.llm = llm;
	}
	/** Plan, execute, review, and return a user-facing summary. */
	async run(options) {
		const config = policyForRequest(this.config(), options.reasoningEffort);
		const routes = resolvedRoleRoutes(config);
		const input = await this.taskInput(options, config.vision);
		if (input.visionNotes !== void 0 && isImageAnalysisTask(input.text)) return input.visionNotes.trim() || input.text;
		const taskText = input.visionNotes === void 0 ? input.text : `${input.text}\n\nVision companion notes:\n${input.visionNotes}`;
		if (isConversationalTask(taskText)) return (await this.call(routes.planner, conversationalPrompt(taskText), options)).text.trim() || taskText;
		const plan = parsePlan((await this.call(routes.planner, plannerPrompt(taskText), options)).text, taskText);
		validateTasks(plan.tasks);
		const workspaceCwd = workspaceCwdFor(this.ctx, options.sessionId);
		const budget = { used: 0 };
		const workers = await this.executeTasks(plan.tasks, plan.acceptance, routes.worker, options, config, budget, workspaceCwd);
		const reviewRoute = config.reviewerEnabled ? routes.reviewer : routes.worker;
		let currentReview = await this.review(plan, workers, reviewRoute, options, config, workspaceCwd);
		let currentWorkers = workers;
		for (let round = 0; !currentReview.pass && currentWorkers.every((worker) => worker.ok) && round < config.orchestration.maxRepairRounds; round += 1) {
			const repairs = repairTasks(plan.tasks, currentReview);
			if (repairs.length === 0) break;
			const repaired = await this.executeTasks(repairs, plan.acceptance, routes.worker, options, config, budget, workspaceCwd, currentReview.summary);
			const byId = new Map(currentWorkers.map((worker) => [worker.taskId, worker]));
			for (const worker of repaired) byId.set(worker.taskId, worker);
			currentWorkers = [...byId.values()];
			currentReview = await this.review(plan, currentWorkers, reviewRoute, options, config, workspaceCwd);
		}
		const diff = await this.readDiff(workspaceCwd);
		if (currentReview.pass && diff.available) {
			this.checkpoint = advanceCheckpoint(diff);
			this.checkpointCwd = workspaceCwd;
		}
		const status = currentReview.pass ? "Captain review passed." : "Captain review stopped with findings.";
		const diffSummary = !diff.available ? "Incremental diff: unavailable" : diff.patch ? `Incremental diff: ${diff.changedFiles.join(", ") || "workspace changes"}` : "Incremental diff: none";
		return [
			status,
			currentReview.summary,
			...currentWorkers.map((worker) => `- ${worker.taskId}: ${worker.ok ? "done" : "failed"}${worker.error ? ` (${worker.error})` : ""}${worker.output ? `\n${worker.output}` : ""}`),
			diffSummary
		].join("\n");
	}
	async executeTasks(tasks, acceptance, route, options, config, budget, workspaceCwd, repairContext = "") {
		const orchestration = config.orchestration;
		const state = createSchedulerState(orchestration);
		const results = [];
		while (!isSettled(tasks, state)) {
			for (const task of settleBlockedTasks(tasks, state)) results.push({
				taskId: task.id,
				ok: false,
				output: "",
				changedFiles: [],
				tokens: 0,
				error: "blocked by a failed dependency"
			});
			if (isSettled(tasks, state)) break;
			const ready = readyTasks(tasks, state);
			if (ready.length === 0) {
				if (state.running.size > 0) {
					await Promise.resolve();
					continue;
				}
				throw new Error("Captain scheduler found no ready task; the planner produced an invalid dependency graph");
			}
			for (const task of ready) {
				if (budget.used + task.tokenBudget > orchestration.totalTokenBudget) throw new Error(`Captain token budget exceeded before task ${task.id}`);
				startTask(state, task, orchestration);
				budget.used += task.tokenBudget;
			}
			const settled = await Promise.all(ready.map(async (task) => {
				try {
					const output = await this.worker(task, acceptance, route, options, repairContext);
					finishTask(state, task, { succeeded: true }, orchestration);
					return {
						taskId: task.id,
						ok: true,
						output,
						changedFiles: await this.changedFiles(workspaceCwd),
						tokens: task.tokenBudget
					};
				} catch (error) {
					finishTask(state, task, failureObservation(error), orchestration);
					return {
						taskId: task.id,
						ok: false,
						output: "",
						changedFiles: [],
						tokens: task.tokenBudget,
						error: String(error)
					};
				}
			}));
			results.push(...settled);
		}
		return results;
	}
	async worker(task, acceptance, route, options, repairContext) {
		const prompt = [
			"You are a DeepSeek implementation worker inside Captain.",
			`Task ${task.id}: ${task.prompt}`,
			`Owned files: ${task.files.join(", ") || "(infer from repository)"}`,
			`Acceptance criteria: ${acceptance.join("; ") || "(none)"}`,
			repairContext ? `Reviewer feedback to fix:\n${repairContext}` : "",
			"Inspect the workspace, make the required incremental changes, run focused checks, and report changed files plus tests."
		].filter(Boolean).join("\n");
		const first = await this.workerCall(task, route, options, prompt);
		if (!isToolCallOnlyOutput(first)) return first;
		const retryPrompt = [prompt, "Your previous response contained unexecuted DSML tool calls. Execute the task with the available tools now. Return a final work report with changed files and checks; do not emit DSML, XML, function calls, or tool-call markup as text."].join("\n\n");
		const retried = await this.workerCall(task, route, options, retryPrompt);
		if (isToolCallOnlyOutput(retried)) throw new Error(`worker ${task.id} returned unexecuted DSML tool calls`);
		return retried;
	}
	async workerCall(task, route, options, prompt) {
		const parent = options.sessionId === void 0 ? void 0 : this.ctx.agents.get(options.sessionId);
		const workflow = this.ctx.get("workflowEngine");
		if (parent !== void 0 && workflow !== void 0) {
			const script = `return await agent(${JSON.stringify(prompt)}, ${JSON.stringify({
				label: task.id,
				provider: route.provider,
				model: route.model
			})})`;
			const run = workflow.start({
				script,
				meta: {
					name: `captain-${task.id}`,
					description: "Captain worker"
				},
				parent,
				...options.signal === void 0 ? {} : { signal: options.signal }
			});
			let result;
			try {
				result = await run.result;
			} finally {
				await run.dispose();
			}
			if (result.stopReason !== "completed") throw new Error(`worker ${task.id} stopped: ${result.stopReason}`);
			return typeof result.value === "string" ? result.value : JSON.stringify(result.value);
		}
		return (await this.call(route, prompt, options)).text;
	}
	async review(plan, workers, route, options, config, workspaceCwd) {
		const failed = workers.filter((worker) => !worker.ok);
		if (failed.length > 0) return {
			pass: false,
			summary: "Worker execution failed before review.",
			findings: failed.map((worker) => ({
				id: `worker-${worker.taskId}`,
				taskId: worker.taskId,
				files: worker.changedFiles,
				severity: "error",
				message: worker.error ?? "worker failed"
			}))
		};
		const diff = await this.readDiff(workspaceCwd);
		const prompt = reviewPrompt(plan.acceptance, workers, diff.patch);
		const parsed = parseReview((await this.call(route, prompt, options, config.orchestration.reviewerTokenBudget)).text);
		if (!reviewNeedsRetry(parsed)) return parsed;
		const correction = [prompt, "Your previous response was not valid reviewer JSON. Return exactly one JSON object and no prose, Markdown, DSML, function calls, or tool calls."].join("\n\n");
		return parseReview((await this.call(route, correction, options, config.orchestration.reviewerTokenBudget)).text);
	}
	async taskInput(options, route) {
		const message = latestUserMessage(options.messages);
		const task = message === void 0 ? "" : textOf(message);
		const images = message === void 0 ? [] : imageInputsOf([message]);
		if (images.length === 0) return { text: task };
		const request = visionRequest(this.llm.listModels === void 0 ? {
			...route,
			reasoningEffort: ""
		} : resolveVisionRoute(route, await this.llm.listModels(route.provider)), [createUserMessage({
			content: [{
				type: "text",
				text: "Inspect the attached images and summarize only details relevant to the user task. Return concise factual notes for the GPT planner and DeepSeek implementation workers."
			}],
			source: { kind: "user" }
		})], images);
		return {
			text: task,
			visionNotes: (await collectText(this.llm.stream({
				...request,
				...options.system === void 0 ? {} : { system: options.system },
				...options.signal === void 0 ? {} : { signal: options.signal },
				...options.sessionId === void 0 ? {} : { sessionId: options.sessionId },
				...options.maxTokens === void 0 ? {} : { maxTokens: options.maxTokens }
			}))).text
		};
	}
	async call(route, prompt, source, maxTokens) {
		const reasoning = await this.reasoningOptions(route);
		return collectText(this.llm.stream({
			provider: route.provider,
			model: route.model,
			messages: [createUserMessage({
				content: [{
					type: "text",
					text: prompt
				}],
				source: { kind: "user" }
			})],
			...reasoning,
			...source.system === void 0 ? {} : { system: source.system },
			...source.signal === void 0 ? {} : { signal: source.signal },
			...maxTokens === void 0 ? {} : { maxTokens }
		}));
	}
	/** Keep Captain policy labels compatible with the selected provider model. */
	async reasoningOptions(route) {
		if (route.reasoningEffort === "" || this.llm.resolveModelInfo === void 0) return route.reasoningEffort === "" ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) };
		const supported = (await this.llm.resolveModelInfo(route.provider, route.model)).reasoning?.efforts.map((effort) => String(effort.id)) ?? [];
		const selected = compatibleReasoningEffort(route.reasoningEffort, supported);
		return selected === void 0 ? {} : { reasoningEffort: ReasoningEffortId(selected) };
	}
	async readDiff(workspaceCwd) {
		if (workspaceCwd === void 0) return {
			head: "unknown",
			patch: "",
			changedFiles: [],
			hash: "00000000",
			available: false
		};
		const git = { run: async (args) => {
			const { execFile } = await import("node:child_process");
			return new Promise((resolve, reject) => {
				execFile("git", [...args], {
					cwd: workspaceCwd,
					maxBuffer: 16 * 1024 * 1024
				}, (error, stdout) => {
					if (error) reject(error);
					else resolve(stdout);
				});
			});
		} };
		try {
			return {
				...await incrementalDiff(git, this.checkpointCwd === workspaceCwd ? this.checkpoint : void 0),
				available: true
			};
		} catch {
			return {
				head: "unknown",
				patch: "",
				changedFiles: [],
				hash: "00000000",
				available: false
			};
		}
	}
	async changedFiles(workspaceCwd) {
		return (await this.readDiff(workspaceCwd)).changedFiles;
	}
};
/**
* Resolve the repository working directory carried by the parent Agent session.
* @param ctx - Host context containing the live Agent registry.
* @param sessionId - Parent Agent identity from the model request.
* @returns The session workspace path, or undefined without a live parent workspace.
*/
function workspaceCwdFor(ctx, sessionId) {
	return sessionId === void 0 ? void 0 : ctx.agents.get(sessionId)?.session.header.cwd;
}
/**
* Whether a worker returned provider tool syntax as text instead of a final work report.
* @param raw - Worker result text.
* @returns True when the complete response is a DSML tool-call envelope.
*/
function isToolCallOnlyOutput(raw) {
	const trimmed = raw.trim();
	if (!/^<\s*[｜|]*DSML[｜|]*(?:tool_calls|tools_call|function_calls)\b/iu.test(trimmed)) return false;
	return /<\s*[｜|]*DSML[｜|]*(?:invoke|tool|function_calls?)\b/iu.test(trimmed);
}
function policyForRequest(config, effort) {
	const selected = effort === void 0 ? void 0 : String(effort);
	if (selected !== "balanced" && selected !== "high-quality" && selected !== "ultra") return config;
	return {
		...config,
		policy: selected
	};
}
function imageInputsOf(messages) {
	const images = [];
	const visit = (blocks) => {
		for (const block of blocks) if (block.type === "image") images.push({ ref: block.attachment });
		else if (block.type === "tool-result") visit(block.content);
	};
	for (const message of messages) visit(message.content);
	return images;
}
function failureObservation(error) {
	const code = typeof error === "object" && error !== null && "failure" in error ? error.failure?.code : void 0;
	const message = String(error).toLowerCase();
	return {
		succeeded: false,
		rateLimited: code === "RATE_LIMIT" || message.includes("rate limit") || message.includes("429"),
		timedOut: code === "TIMEOUT" || message.includes("timeout")
	};
}
/** Collect visible text and usage from a canonical stream. */
async function collectText(stream) {
	const chunks = [];
	let text = "";
	let outputTokens;
	for await (const chunk of stream) {
		chunks.push(chunk);
		if (chunk.type === "text-delta") text += chunk.text;
		if (chunk.type === "block-end" && chunk.block.type === "text") text += text.endsWith(chunk.block.text) ? "" : chunk.block.text;
		if (chunk.type === "usage") outputTokens = chunk.usage.outputTokens;
		if (chunk.type === "finish" && (chunk.reason.kind === "error" || chunk.reason.kind === "aborted")) {
			const error = new Error(chunk.reason.failure.message);
			error.failure = chunk.reason.failure;
			error.code = chunk.reason.failure.code;
			throw error;
		}
	}
	return {
		text,
		chunks,
		...outputTokens === void 0 ? {} : { outputTokens }
	};
}
function plannerPrompt(task) {
	return [
		"You are the GPT planning brain inside Captain.",
		"Turn the task into a small dependency DAG. Return JSON only:",
		"{\"tasks\":[{\"id\":string,\"prompt\":string,\"dependsOn\":string[],\"files\":string[],\"tokenBudget\":number}],\"acceptance\":string[]}",
		"Use independent tasks for parallel work and never assign overlapping files to independent tasks.",
		`User task:\n${task}`
	].join("\n\n");
}
/** Identify short social turns that should not start a repository-changing run. */
function isConversationalTask(task) {
	return /^(?:\u65e9\u4e0a\u597d|\u4e2d\u5348\u597d|\u4e0b\u5348\u597d|\u665a\u4e0a\u597d|\u5348\u5b89|\u665a\u5b89|\u4f60\u597d|\u60a8\u597d|\u55e8|\u54c8\u55bd|hello|hi|hey|\u5728\u5417|\u5728\u7ebf\u5417|\u8c22\u8c22|\u591a\u8c22)[!！,.\uFF0C\u3002?？\s]*$/iu.test(task.trim());
}
/** Whether a short image turn asks only for visual facts rather than repository work. */
function isImageAnalysisTask(task) {
	const normalized = task.trim();
	if (normalized.length === 0 || normalized.length > 300) return false;
	const asksAboutImage = /(?:识别|描述|说明|看看|看下|图里|图片|截图|image|screenshot|photo|picture)/i.test(normalized);
	const requestsImplementation = /(?:修复|修改|实现|代码|编写|开发|部署|提交|发布|fix|change|implement|code|build|deploy|commit|release)/i.test(normalized);
	return asksAboutImage && !requestsImplementation;
}
function conversationalPrompt(task) {
	return `Reply naturally to this short conversational message. Do not plan code, call tools, return JSON, or mention Captain internals. Return only the user-facing reply.\n\nUser message: ${task}`;
}
function parsePlan(raw, fallback) {
	const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
	if (candidate !== void 0) try {
		const value = JSON.parse(candidate);
		if (isRecord(value) && Array.isArray(value.tasks)) {
			const tasks = value.tasks.flatMap((item, index) => {
				if (!isRecord(item) || typeof item.prompt !== "string") return [];
				return [{
					id: typeof item.id === "string" ? item.id : `task-${index + 1}`,
					prompt: item.prompt,
					dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.filter((id) => typeof id === "string") : [],
					files: Array.isArray(item.files) ? item.files.filter((file) => typeof file === "string") : [],
					tokenBudget: typeof item.tokenBudget === "number" && item.tokenBudget > 0 ? item.tokenBudget : 8e3
				}];
			});
			if (tasks.length > 0) return {
				tasks,
				acceptance: Array.isArray(value.acceptance) ? value.acceptance.filter((item) => typeof item === "string") : []
			};
		}
	} catch {}
	return {
		tasks: [{
			id: "task-1",
			prompt: fallback,
			dependsOn: [],
			files: [],
			tokenBudget: 8e3
		}],
		acceptance: []
	};
}
function latestUserMessage(messages) {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message !== void 0 && message.role === "user" && message.source.kind === "user") return message;
	}
}
function textOf(message) {
	return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region lib/types/adapter.js
/** Synthetic provider id shown as the native model-directory group. */
const CAPTAIN_PROVIDER = "captain";
/** Adapter that turns one Captain selection into a planner/worker/reviewer run. */
var CaptainAdapter = class extends LlmAdapter {
	ctx;
	config;
	orchestrator;
	constructor(ctx, config) {
		super();
		this.ctx = ctx;
		this.config = config;
		this.orchestrator = new CaptainOrchestrator(ctx, config, ctx.llm);
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: "Captain / 船长"
		};
	}
	async listModels(provider) {
		const config = this.config();
		const providers = new Set(this.ctx.llm.listProviders().map((item) => item.id));
		const requiredProviders = [config.planner.provider, config.worker.provider];
		if (config.reviewerEnabled) requiredProviders.push(config.reviewer.provider);
		if (!requiredProviders.every((id) => providers.has(id))) return [];
		const model = await this.catalogModel(config);
		return [{
			provider,
			id: model.id,
			name: model.name,
			description: model.description,
			inputModalities: ["text", "image"]
		}];
	}
	async resolveModel(provider, model) {
		const entry = await this.catalogModel(this.config());
		return {
			provider,
			id: model,
			name: entry.name,
			description: entry.description,
			inputModalities: ["text", "image"],
			reasoning: {
				efforts: entry.reasoningEfforts,
				defaultEffort: ReasoningEffortId(this.config().policy)
			}
		};
	}
	async *stream(options) {
		const text = await this.orchestrator.run(options);
		yield {
			type: "block-start",
			index: 0,
			blockType: "text"
		};
		yield {
			type: "text-delta",
			index: 0,
			text
		};
		yield {
			type: "block-end",
			index: 0,
			block: {
				type: "text",
				text
			}
		};
		yield {
			type: "finish",
			reason: { kind: "stop" }
		};
	}
	async catalogModel(config) {
		const [planner, worker] = await Promise.all([this.ctx.llm.listModels(config.planner.provider), this.ctx.llm.listModels(config.worker.provider)]);
		const plannerName = planner.find((item) => item.id === config.planner.model)?.name ?? displayModelName(config.planner.model);
		const workerName = worker.find((item) => item.id === config.worker.model)?.name ?? displayModelName(config.worker.model);
		return {
			id: `captain:${config.planner.model}->${config.worker.model}`,
			name: `${plannerName} -> ${workerName}`,
			description: config.reviewerEnabled ? "GPT planner + DeepSeek worker + GPT independent reviewer" : "GPT planner + DeepSeek worker + DeepSeek worker review",
			reasoningEfforts: [
				{
					id: ReasoningEffortId("balanced"),
					name: "Balanced"
				},
				{
					id: ReasoningEffortId("high-quality"),
					name: "High Quality"
				},
				{
					id: ReasoningEffortId("ultra"),
					name: "Ultra"
				}
			]
		};
	}
};
/** Give relay-only model ids a stable selector label when a catalog has no display name. */
function displayModelName(id) {
	const normalized = id.trim();
	const gpt = normalized.match(/^gpt-(.+)$/i);
	if (gpt !== null) return `GPT-${titleWords(gpt[1] ?? "")}`;
	const deepseek = normalized.match(/^deepseek-(.+)$/i);
	if (deepseek !== null) return `DeepSeek ${titleWords(deepseek[1] ?? "")}`;
	return titleWords(normalized);
}
function titleWords(value) {
	return value.split(/[-_\s]+/).filter(Boolean).map((word) => {
		if (/^v\d/i.test(word)) return `V${word.slice(1)}`;
		return word.charAt(0).toUpperCase() + word.slice(1);
	}).join(" ");
}
//#endregion
//#region lib/types/config.js
const roleRoute = z.object({
	provider: z.string().required(),
	model: z.string().required(),
	reasoningEffort: z.string().default("")
});
const DEFAULT_CAPTAIN_CONFIG = {
	default: {
		provider: "gpt-relay",
		model: "gpt-5.6-terra",
		reasoningEffort: ""
	},
	planner: {
		provider: "gpt-relay",
		model: "gpt-5.6-sol",
		reasoningEffort: ""
	},
	worker: {
		provider: "deepseek-official",
		model: "deepseek-v4-flash",
		reasoningEffort: ""
	},
	reviewer: {
		provider: "gpt-relay",
		model: "gpt-5.6-terra",
		reasoningEffort: ""
	},
	vision: {
		provider: "gpt-relay",
		model: "gpt-5.6-terra",
		reasoningEffort: ""
	},
	reviewerEnabled: true,
	policy: "ultra",
	orchestration: {
		mode: "auto",
		minAgents: 1,
		maxAgents: 16,
		maxParallel: 0,
		totalTokenBudget: 12e4,
		reviewerTokenBudget: 3e4,
		maxRepairRounds: 3,
		adaptiveConcurrency: true
	}
};
const Config = z.object({
	default: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.default),
	planner: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.planner),
	worker: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.worker),
	reviewer: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.reviewer),
	vision: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.vision),
	reviewerEnabled: z.boolean().default(DEFAULT_CAPTAIN_CONFIG.reviewerEnabled),
	policy: z.union([
		"balanced",
		"high-quality",
		"ultra"
	]).default(DEFAULT_CAPTAIN_CONFIG.policy),
	orchestration: z.object({
		mode: z.union(["auto", "fixed"]).default("auto"),
		minAgents: z.number().step(1).min(1).max(128).default(1),
		maxAgents: z.number().step(1).min(1).max(128).default(16),
		maxParallel: z.number().step(1).min(0).max(128).default(0),
		totalTokenBudget: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(12e4),
		reviewerTokenBudget: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(3e4),
		maxRepairRounds: z.number().step(1).min(0).max(20).default(3),
		adaptiveConcurrency: z.boolean().default(true)
	}).default(DEFAULT_CAPTAIN_CONFIG.orchestration)
});
/** The settings namespace used by the Host and browser halves. */
const CAPTAIN_SETTINGS_NAMESPACE = "captain";
//#endregion
//#region lib/types/index.js
const name = "captain";
const inject = [
	"llm",
	"settings",
	"agents"
];
const NS = settingsNamespace(CAPTAIN_SETTINGS_NAMESPACE);
/** Mount Captain's synthetic provider and hot-reloadable settings section. */
function apply(ctx, config) {
	let current = () => config;
	const adapter = new CaptainAdapter(ctx, () => current());
	ctx.llm.registerAdapter([CAPTAIN_PROVIDER], adapter);
	const configurable = {
		provider: CAPTAIN_PROVIDER,
		displayName: "Captain / 船长",
		settingsNs: NS,
		settingsPath: [],
		declared: true
	};
	ctx.llm.registerConfigurableProviders([configurable]);
	installSettingsSection(ctx, NS, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {}
	});
}
//#endregion
export { CAPTAIN_PROVIDER, CAPTAIN_SETTINGS_NAMESPACE, CaptainAdapter, Config, DEFAULT_CAPTAIN_CONFIG, advanceCheckpoint, apply, createSchedulerState, diffHash, effortPreset, finishTask, incrementalDiff, inject, isSettled, name, parseReview, readyTasks, repairTasks, resolvedRoleRoutes, reviewNeedsRetry, reviewPrompt, settleBlockedTasks, startTask, validateTasks, visionRequest, withImages };
