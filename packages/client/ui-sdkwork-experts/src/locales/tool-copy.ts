/**
 * Model-facing tool copy. These strings describe the summon tools to the model,
 * so they live in a locale module rather than inline in the tool registration.
 */

/**
 * The shared brief contract appended to every summon task parameter.
 * @param maxChars - the per-task character budget the schema enforces.
 * @returns the description text.
 */
export function summonTaskBrief(maxChars: number): string {
  return `Short brief only: the user goal, constraints, and file paths. Do not paste source, CSS, HTML, or quoted code; an unescaped quote makes the tool JSON invalid and no expert starts. At most ${maxChars} characters. The expert reads the files itself.`
}

/** The extra sentence the multi-expert tool adds for each member task. */
export const SUMMON_MEMBER_TASK_SUFFIX = "One sentence of this expert's role is enough; do not repeat a long brief for every expert."
