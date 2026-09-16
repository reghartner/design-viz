# Content

- Prose-only: verify the changed claims, links, paths and commands against their
  actual source. Read only the contract/recipe section being changed. No browser
  run or full product test suite solely for wording.
- Spec/example: use `node tools/validate.js path/to/spec.json` on actual diagram
  specs (registries, trace exports and catalog snapshots have different formats).
  Check that the story matches its source, references resolve, and happy/alternate
  paths demonstrate the intended outcome. Preview new visual stories. Executable
  sample-app changes also need their behavior tests and the canon route.
- Contract/recipe: confirm defaults and examples against validator/renderer/editor
  behavior. Route into the implementation being described if semantics change.
  New authoring capabilities need discoverable guidance in
  `.claude/skills/hld-to-page/SKILL.md` and the relevant cookbook/guide.
- Skill: verify name/description scope, relative links and conditional loading.
  Walk a representative trigger through the routing table, including mixed and
  unmatched diffs. Validate frontmatter with the skill-creator checker when
  available. Avoid duplicating long contracts or hardcoding session permissions.

Documentation that instructs a privileged action deserves review of the resulting
action, even if the diff contains only Markdown. Don't execute example write or
deployment commands merely to check their syntax.
