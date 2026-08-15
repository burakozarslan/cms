# UI & Frontend Development Rules

## FlyonUI Integration

- Whenever you are generating, modifying, or refactoring UI components, pages, templates, or HTML/Tailwind markup:
  1. **Query FlyonUI MCP first**: Always consult the `flyonui` MCP server tools to search and fetch official FlyonUI component structures, semantic classes, and block templates before writing UI markup.
  2. **Use Semantic Classes**: Prioritize official FlyonUI semantic classes (e.g., `btn`, `card`, `drawer`, `accordion`, `modal`, `navbar`) over ad-hoc raw utility styles.
  3. **Interactive Components**: Ensure necessary FlyonUI JavaScript plugins and data attributes (such as `data-collapse`, `data-overlay`, `data-tabs`) are included when interactive elements are built.
  4. **Maintain Consistency**: Follow the FlyonUI design system conventions for colors, typography, sizing, and dark mode support.
