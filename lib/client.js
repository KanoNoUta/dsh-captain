window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-captain",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region \0dsh-css:CaptainSettingsCard.module.css.mjs
		const css = ".YbLD6q_card{border:1px solid var(--border-subtle,#d8dbe2);background:var(--surface,#fff);list-style:none}.YbLD6q_header{text-align:left;cursor:pointer;background:0 0;border:0;width:100%;padding:14px 16px}.YbLD6q_title{color:var(--text-primary,#1b1f24);font-weight:650;display:block}.YbLD6q_description{color:var(--text-secondary,#68707c);margin-top:4px;font-size:12px;display:block}.YbLD6q_body{gap:16px;padding:0 16px 16px;display:grid}.YbLD6q_section{border-top:1px solid var(--border-subtle,#d8dbe2);gap:8px;padding-top:12px;display:grid}.YbLD6q_sectionTitle{color:var(--text-primary,#1b1f24);margin:0;font-size:13px}.YbLD6q_sectionHeading{justify-content:space-between;align-items:center;gap:12px;display:flex}.YbLD6q_toggle{align-items:center;gap:7px;display:inline-flex}.YbLD6q_grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;display:grid}.YbLD6q_field{gap:4px;min-width:0;display:grid}.YbLD6q_label{color:var(--text-secondary,#68707c);font-size:11px}.YbLD6q_input,.YbLD6q_select{box-sizing:border-box;border:1px solid var(--border-subtle,#d8dbe2);background:var(--surface-raised,#f7f8fa);width:100%;min-width:0;color:var(--text-primary,#1b1f24);padding:7px 8px}.YbLD6q_checkbox{width:18px;height:18px;accent-color:var(--accent,#276ef1);margin:5px 0}.YbLD6q_input:disabled,.YbLD6q_select:disabled,.YbLD6q_checkbox:disabled{cursor:not-allowed;opacity:.6}.YbLD6q_hint{color:var(--text-secondary,#68707c);margin:0;font-size:11px}.YbLD6q_footer{align-items:center;gap:8px;display:flex}.YbLD6q_button{border:1px solid var(--border-strong,#9aa2ad);background:var(--surface-raised,#f7f8fa);color:var(--text-primary,#1b1f24);cursor:pointer;padding:7px 10px}.YbLD6q_buttonPrimary{border-color:var(--accent,#276ef1);background:var(--accent,#276ef1);color:#fff}.YbLD6q_status{color:var(--text-secondary,#68707c);font-size:12px}@media (width<=720px){.YbLD6q_grid{grid-template-columns:1fr}}";
		const tagId = "@deepseek-ai/dsh-captain/CaptainSettingsCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-captain";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CaptainSettingsCard_module_css_default = {
			"sectionTitle": "YbLD6q_sectionTitle",
			"card": "YbLD6q_card",
			"field": "YbLD6q_field",
			"header": "YbLD6q_header",
			"input": "YbLD6q_input",
			"body": "YbLD6q_body",
			"description": "YbLD6q_description",
			"section": "YbLD6q_section",
			"label": "YbLD6q_label",
			"checkbox": "YbLD6q_checkbox",
			"button": "YbLD6q_button",
			"hint": "YbLD6q_hint",
			"footer": "YbLD6q_footer",
			"title": "YbLD6q_title",
			"status": "YbLD6q_status",
			"grid": "YbLD6q_grid",
			"toggle": "YbLD6q_toggle",
			"select": "YbLD6q_select",
			"buttonPrimary": "YbLD6q_buttonPrimary",
			"sectionHeading": "YbLD6q_sectionHeading"
		};
		//#endregion
		//#region src/vision-model.ts
		/** Whether a model name is a likely dedicated vision route for selector filtering. */
		function isLikelyVisionModel(id) {
			return /(?:^|[-_.])(luna|terra|vision|image|vl|omni)(?:$|[-_.])/i.test(id);
		}
		//#endregion
		//#region src/client/CaptainSettingsCard.tsx
		const GPT_RELAY_EFFORTS = [
			{
				value: "low",
				labelKey: "effortLow"
			},
			{
				value: "medium",
				labelKey: "effortMedium"
			},
			{
				value: "high",
				labelKey: "effortHigh"
			},
			{
				value: "xhigh",
				labelKey: "effortXHigh"
			}
		];
		/** Render the native Captain configuration card inside Plugins settings. */
		function CaptainSettingsCard(props) {
			const state = props.useCaptainCard((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			if (!state.available) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: CaptainSettingsCard_module_css_default.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: CaptainSettingsCard_module_css_default.header,
					"aria-expanded": open,
					onClick: () => {
						const next = !open;
						setOpen(next);
						if (next) props.loadModels();
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CaptainSettingsCard_module_css_default.title,
						children: props.t("title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CaptainSettingsCard_module_css_default.description,
						children: props.t("description")
					})]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CaptainSettingsCard_module_css_default.body,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: CaptainSettingsCard_module_css_default.hint,
							children: props.t("relayHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleSection, {
							title: props.t("planner"),
							role: "planner",
							route: state.draft.planner,
							effort: state.draft.planner.reasoningEffort,
							groups: state.catalogGroups,
							disabled: !state.writable,
							onEdit: props.edit,
							t: props.t
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleSection, {
							title: props.t("worker"),
							role: "worker",
							route: state.draft.worker,
							effort: state.draft.worker.reasoningEffort,
							groups: state.catalogGroups,
							disabled: !state.writable,
							onEdit: props.edit,
							t: props.t
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleSection, {
							title: props.t("reviewer"),
							role: "reviewer",
							route: state.draft.reviewer,
							effort: state.draft.reviewer.reasoningEffort,
							groups: state.catalogGroups,
							disabled: !state.writable || !state.draft.reviewerEnabled,
							enabled: state.draft.reviewerEnabled,
							onToggle: (value) => {
								props.edit("reviewerEnabled", value);
							},
							onEdit: props.edit,
							t: props.t
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleSection, {
							title: props.t("vision"),
							role: "vision",
							route: state.draft.vision,
							effort: state.draft.vision.reasoningEffort,
							groups: state.catalogGroups,
							disabled: !state.writable,
							onEdit: props.edit,
							t: props.t
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CaptainSettingsCard_module_css_default.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: CaptainSettingsCard_module_css_default.sectionTitle,
								children: props.t("orchestration")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CaptainSettingsCard_module_css_default.grid,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
										label: props.t("policy"),
										value: state.draft.policy,
										options: [
											{
												value: "balanced",
												label: props.t("policyBalanced")
											},
											{
												value: "high-quality",
												label: props.t("policyHighQuality")
											},
											{
												value: "ultra",
												label: props.t("policyUltra")
											}
										],
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("policy", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
										label: props.t("mode"),
										value: state.draft.orchestration.mode,
										options: [{
											value: "auto",
											label: props.t("modeAuto")
										}, {
											value: "fixed",
											label: props.t("modeFixed")
										}],
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("orchestration.mode", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
										label: props.t("minAgents"),
										value: String(state.draft.orchestration.minAgents),
										min: 1,
										max: 128,
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("orchestration.minAgents", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
										label: props.t("maxAgents"),
										value: String(state.draft.orchestration.maxAgents),
										min: 1,
										max: 128,
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("orchestration.maxAgents", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
										label: props.t("maxParallel"),
										value: String(state.draft.orchestration.maxParallel),
										min: 0,
										max: 128,
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("orchestration.maxParallel", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
										label: props.t("totalTokenBudget"),
										value: String(state.draft.orchestration.totalTokenBudget),
										min: 1,
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("orchestration.totalTokenBudget", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
										label: props.t("reviewerTokenBudget"),
										value: String(state.draft.orchestration.reviewerTokenBudget),
										min: 1,
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("orchestration.reviewerTokenBudget", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
										label: props.t("maxRepairRounds"),
										value: String(state.draft.orchestration.maxRepairRounds),
										min: 0,
										max: 20,
										disabled: !state.writable,
										onChange: (value) => {
											props.edit("orchestration.maxRepairRounds", value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: CaptainSettingsCard_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: CaptainSettingsCard_module_css_default.label,
											children: props.t("adaptiveConcurrency")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: CaptainSettingsCard_module_css_default.checkbox,
											type: "checkbox",
											checked: state.draft.orchestration.adaptiveConcurrency,
											disabled: !state.writable,
											onChange: (event) => {
												props.edit("orchestration.adaptiveConcurrency", event.target.checked);
											}
										})]
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CaptainSettingsCard_module_css_default.footer,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: CaptainSettingsCard_module_css_default.button,
									onClick: () => {
										props.reset();
									},
									children: props.t("reset")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${CaptainSettingsCard_module_css_default.button} ${CaptainSettingsCard_module_css_default.buttonPrimary}`,
									disabled: !state.dirty || state.saving,
									onClick: () => {
										props.save();
									},
									children: state.saving ? props.t("saving") : props.t("save")
								}),
								state.saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CaptainSettingsCard_module_css_default.status,
									children: props.t("saved")
								}),
								state.error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CaptainSettingsCard_module_css_default.status,
									children: state.error
								}),
								state.catalogError && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: CaptainSettingsCard_module_css_default.status,
									children: [
										props.t("catalogFailed"),
										": ",
										state.catalogError
									]
								})
							]
						})
					]
				})]
			});
		}
		function RoleSection({ title, role, route, effort, groups, disabled, enabled, onToggle, onEdit, t }) {
			const providerOptions = groups.map((group) => ({
				value: group.id,
				label: displayProviderName(group.id, group.name)
			}));
			appendCurrentOption(providerOptions, route.provider, displayProviderName(route.provider, route.provider));
			const group = groups.find((entry) => entry.id === route.provider);
			const providerModels = group?.models ?? [];
			const likelyVisionModels = role === "vision" ? providerModels.filter((model) => isLikelyVisionModel(model.id)) : [];
			const modelOptions = (role === "vision" && likelyVisionModels.length > 0 ? likelyVisionModels : providerModels).map((model) => ({
				value: model.id,
				label: model.name
			}));
			if (role !== "vision" || likelyVisionModels.length === 0) appendCurrentOption(modelOptions, route.model);
			const advertisedEfforts = (group?.models.find((entry) => entry.id === route.model))?.reasoning?.efforts ?? (isGptRelayModel(route.provider, route.model) ? GPT_RELAY_EFFORTS.map((entry) => ({
				value: entry.value,
				label: t(entry.labelKey)
			})) : []);
			const effortOptions = [{
				value: "",
				label: t("effortAuto")
			}, ...advertisedEfforts.map((entry) => ({
				value: "id" in entry ? entry.id : entry.value,
				label: "name" in entry ? entry.name : entry.label
			}))];
			appendCurrentOption(effortOptions, effort);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CaptainSettingsCard_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CaptainSettingsCard_module_css_default.sectionHeading,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: CaptainSettingsCard_module_css_default.sectionTitle,
						children: title
					}), onToggle !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: CaptainSettingsCard_module_css_default.toggle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CaptainSettingsCard_module_css_default.label,
							children: t("reviewerEnabled")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: CaptainSettingsCard_module_css_default.checkbox,
							type: "checkbox",
							checked: enabled === true,
							onChange: (event) => {
								onToggle(event.target.checked);
							}
						})]
					})]
				}), onToggle !== void 0 && enabled === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: CaptainSettingsCard_module_css_default.hint,
					children: t("reviewerFallback")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CaptainSettingsCard_module_css_default.grid,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
							label: t("provider"),
							value: route.provider,
							options: providerOptions,
							disabled,
							onChange: (value) => {
								onEdit(`${role}.provider`, value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
							label: t("model"),
							value: route.model,
							options: modelOptions,
							disabled,
							onChange: (value) => {
								onEdit(`${role}.model`, value);
							}
						}),
						role !== "vision" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
							label: t("effort"),
							value: effort,
							options: effortOptions,
							disabled,
							onChange: (value) => {
								onEdit(`${role}.reasoningEffort`, value);
							}
						})
					]
				})]
			});
		}
		function isGptRelayModel(provider, model) {
			return provider === "gpt-relay" && model.startsWith("gpt-");
		}
		function appendCurrentOption(options, current, label = current) {
			if (current.length > 0 && !options.some((option) => option.value === current)) options.push({
				value: current,
				label
			});
		}
		/** Keep the two active DeepSeek routes distinct in the settings selector. */
		function displayProviderName(provider, name) {
			if (provider === "deepseek-official") return "Official DeepSeek";
			if (provider === "opencode-go") return "OpenCode DeepSeek";
			return name;
		}
		function SelectField({ label, value, options, disabled, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: CaptainSettingsCard_module_css_default.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CaptainSettingsCard_module_css_default.label,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					className: CaptainSettingsCard_module_css_default.select,
					value,
					disabled,
					onChange: (event) => {
						onChange(event.target.value);
					},
					children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: option.value,
						children: option.label
					}, option.value))
				})]
			});
		}
		function NumberField({ label, value, min, max, disabled, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: CaptainSettingsCard_module_css_default.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CaptainSettingsCard_module_css_default.label,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: CaptainSettingsCard_module_css_default.input,
					type: "number",
					step: 1,
					min,
					...max === void 0 ? {} : { max },
					value,
					disabled,
					onChange: (event) => {
						if (event.target.value.length > 0) onChange(event.target.value);
					}
				})]
			});
		}
		//#endregion
		//#region src/client/constants.ts
		/** Browser-safe settings namespace and defaults; no Host schema imports. */
		const CAPTAIN_SETTINGS_NAMESPACE = "captain";
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
		//#endregion
		//#region src/client/captain-card-controller.ts
		/** Staged form controller over the Host-owned Captain settings namespace. */
		var CaptainCardController = class {
			scope;
			api;
			draft = structuredClone(DEFAULT_CAPTAIN_CONFIG);
			dirty = false;
			saving = false;
			saved = false;
			error;
			catalogStatus = "idle";
			catalogError;
			catalogGroups = [];
			catalogGeneration = 0;
			store;
			constructor(scope, api) {
				this.scope = scope;
				this.api = api;
				this.store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.snapshot());
				scope.subscribe(() => {
					const value = scope.getSnapshot().value;
					if (value !== void 0 && !this.dirty && !this.saving) this.draft = structuredClone(value);
					this.publish();
				});
			}
			/** Build the slot face. */
			inject() {
				return {
					hooks: { captainCard: this.store },
					edit: (path, value) => {
						this.edit(path, value);
					},
					loadModels: () => {
						this.loadModels();
					},
					save: () => {
						this.save();
					},
					reset: () => {
						this.reset();
					}
				};
			}
			snapshot() {
				const remote = this.scope.getSnapshot();
				return {
					available: remote.status === "ready",
					writable: remote.writable,
					dirty: this.dirty,
					saving: this.saving,
					saved: this.saved,
					...this.error === void 0 ? {} : { error: this.error },
					catalogStatus: this.catalogStatus,
					...this.catalogError === void 0 ? {} : { catalogError: this.catalogError },
					catalogGroups: this.catalogGroups,
					draft: this.draft
				};
			}
			publish() {
				this.store.set(this.snapshot());
			}
			edit(path, value) {
				const next = structuredClone(this.draft);
				const [group, field] = path.split(".", 2);
				if (group === "policy" && typeof value === "string") next.policy = value;
				else if (group === "orchestration" && field !== void 0) {
					const current = next.orchestration[field];
					if (typeof current === "boolean") next.orchestration[field] = Boolean(value);
					else if (typeof current === "number") next.orchestration[field] = Number(value);
					else next.orchestration[field] = String(value);
				} else if (group === "reviewerEnabled" && typeof value === "boolean") next.reviewerEnabled = value;
				else if (group !== void 0 && group in next && field !== void 0) {
					const role = next[group];
					if (field === "provider") {
						role.provider = String(value);
						const models = this.catalogGroups.find((entry) => entry.id === role.provider)?.models ?? [];
						if (!models.some((model) => model.id === role.model)) role.model = models[0]?.id ?? "";
						this.clearUnsupportedEffort(role);
					} else if (field === "model") {
						role.model = String(value);
						this.clearUnsupportedEffort(role);
					} else if (field === "reasoningEffort") role.reasoningEffort = String(value);
				}
				this.draft = next;
				this.dirty = true;
				this.saved = false;
				this.error = void 0;
				this.publish();
			}
			clearUnsupportedEffort(route) {
				if (route.reasoningEffort.length === 0) return;
				const model = this.catalogGroups.find((group) => group.id === route.provider)?.models.find((entry) => entry.id === route.model);
				if (model?.reasoning === void 0) return;
				if (!model.reasoning.efforts.some((effort) => effort.id === route.reasoningEffort)) route.reasoningEffort = "";
			}
			/** Refresh the host-scoped model catalog used by route selects. */
			async loadModels() {
				const generation = ++this.catalogGeneration;
				this.catalogStatus = "loading";
				this.catalogError = void 0;
				this.publish();
				try {
					const response = await this.api.llm.models({});
					if (!response.result.ok) throw new Error(response.result.error.message);
					if (generation !== this.catalogGeneration) return;
					this.catalogGroups = response.result.value.groups;
					this.catalogStatus = "ready";
				} catch (error) {
					if (generation !== this.catalogGeneration) return;
					this.catalogStatus = "error";
					this.catalogError = error instanceof Error ? error.message : String(error);
				}
				this.publish();
			}
			async save() {
				if (!this.dirty || this.saving || !this.scope.getSnapshot().writable) return;
				this.saving = true;
				this.error = void 0;
				this.publish();
				try {
					await this.scope.set("default", this.draft.default);
					await this.scope.set("planner", this.draft.planner);
					await this.scope.set("worker", this.draft.worker);
					await this.scope.set("reviewer", this.draft.reviewer);
					await this.scope.set("vision", this.draft.vision);
					await this.scope.set("reviewerEnabled", this.draft.reviewerEnabled);
					await this.scope.set("policy", this.draft.policy);
					await this.scope.set("orchestration", this.draft.orchestration);
					this.dirty = false;
					this.saved = true;
				} catch (error) {
					this.error = String(error);
				} finally {
					this.saving = false;
					this.publish();
				}
			}
			reset() {
				this.draft = structuredClone(this.scope.getSnapshot().value ?? DEFAULT_CAPTAIN_CONFIG);
				this.dirty = false;
				this.error = void 0;
				this.publish();
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/** Captain browser dictionaries. */
		const NS = "captain";
		const en = {
			title: "Captain",
			description: "GPT plans and reviews while DeepSeek implements the change.",
			policy: "Thinking policy",
			planner: "GPT planner",
			worker: "DeepSeek worker",
			reviewer: "GPT reviewer",
			reviewerEnabled: "Use GPT reviewer",
			reviewerFallback: "GPT review is off; the current DeepSeek worker model reviews the diff.",
			vision: "Vision companion",
			provider: "Provider route",
			model: "Model id",
			effort: "Reasoning effort",
			effortAuto: "Auto (provider default)",
			effortLow: "Low",
			effortMedium: "Medium",
			effortHigh: "High",
			effortXHigh: "XHigh",
			orchestration: "Orchestration",
			mode: "Scheduling mode",
			modeAuto: "Auto",
			modeFixed: "Fixed",
			policyBalanced: "Balanced",
			policyHighQuality: "High quality",
			policyUltra: "Ultra",
			minAgents: "Minimum agents",
			maxAgents: "Maximum agents",
			maxParallel: "Maximum parallel",
			totalTokenBudget: "Total token budget",
			reviewerTokenBudget: "Reviewer token budget",
			maxRepairRounds: "Review repair rounds",
			adaptiveConcurrency: "Adaptive concurrency",
			save: "Save Captain settings",
			reset: "Reset",
			saving: "Saving…",
			saved: "Saved",
			catalogFailed: "Model directory failed to load",
			unavailable: "Captain settings are unavailable in this deployment.",
			relayHint: "Use OpenAI-compatible relay routes. OAuth is not used."
		};
		const zh = {
			title: "船长",
			description: "GPT 负责规划和审核，DeepSeek 负责落地修改。",
			policy: "思考策略",
			planner: "GPT 规划器",
			worker: "DeepSeek 执行器",
			reviewer: "GPT 审核器",
			reviewerEnabled: "启用 GPT 审核",
			reviewerFallback: "已关闭 GPT 审核，将使用当前 DeepSeek 执行器模型审核 Diff。",
			vision: "视觉伴侣",
			provider: "中转提供方",
			model: "模型 ID",
			effort: "思考强度",
			effortAuto: "自动（使用模型默认值）",
			effortLow: "低",
			effortMedium: "中",
			effortHigh: "高",
			effortXHigh: "极高（XHigh）",
			orchestration: "多 Agent 调度",
			mode: "调度模式",
			modeAuto: "自动调度",
			modeFixed: "固定调度",
			policyBalanced: "均衡",
			policyHighQuality: "高质量",
			policyUltra: "Ultra",
			minAgents: "最少 Agent 数",
			maxAgents: "最多 Agent 数",
			maxParallel: "最大并发数",
			totalTokenBudget: "总 Token 预算",
			reviewerTokenBudget: "审核 Token 预算",
			maxRepairRounds: "审核返工轮数",
			adaptiveConcurrency: "自适应并发",
			save: "保存船长设置",
			reset: "重置",
			saving: "保存中…",
			saved: "已保存",
			catalogFailed: "模型目录加载失败",
			unavailable: "当前部署没有开放船长设置。",
			relayHint: "使用 OpenAI-compatible 中转路由，不接官方 OAuth。"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"locale",
			"settingsScope",
			"connection"
		];
		/** Register Captain dictionaries and its feature-owned settings card. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				en,
				zh
			}), "captain: dictionaries");
			const connection = ctx.get("connection");
			const controller = new CaptainCardController(ctx.settingsScope.bind({ namespace: CAPTAIN_SETTINGS_NAMESPACE }), connection.api);
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: "captain",
				order: 30,
				locale: NS,
				inject: () => controller.inject()
			}, CaptainSettingsCard));
		}
		//#endregion
		exports.CaptainSettingsCard = CaptainSettingsCard;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
