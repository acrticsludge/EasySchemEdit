# PRODUCT — EasySchemEdit

Mode: **Operate**. The visitor is in the editor to complete a concrete task: compose, inspect, transform and verify Minecraft schematics.

World: **Precision instrument**.

The editor is a measurement tool. The existing shell regions, their behaviors, and every editor action are preserved. A control earns its place by helping the user measure, select, transform or verify blocks; decoration that does not serve that job is left out. One accent, one type system, one spacing scale, and state that reads through a glyph or word plus color rather than color alone.

Surface: the web editor at 1440, 1280 and 1024px. The landing page is a redirect and is not part of this direction. Login, first-project, MCP-connect and project/import/export dialogs are out of scope. No behavior, data-model or framework change.

Source of truth: `docs/specs/SPEC.ui-precision-instrument.md`. Rationale: `docs/audits/ui-critique-2026-11-18.md`. Design implementation: `DESIGN.md`.

## Dense-tool amplification (pass 2)

This direction tightens the same instrument. The five shell regions keep their spatial roles: toolbar on top, outliner left, viewport center, inspector right, and the dock with status bar along the bottom. What changes is dimension and framing. The palette raises separation between canvas, panel, input well and control face, with one amber accent carrying active state. Density follows the control scale: a 44px toolbar, 30px panel headers, 26px inputs, 24px rows and icon actions, and 28px tab and status bars. The left panel opens at 240px and the dock at 180px. The viewport sits 8px inside the shell with a 1px hairline frame.

No new features. The amplification adds no region, activity rail, button, control, shortcut, dependency or font. Every handler, command, store call, tooltip and aria-label stays unchanged. All work is presentation over controls that already exist, checked against the same behavior.

Research note (2026-11-18): dense tools need stable spatial roles rather than more whitespace. The canvas carries identity; color encodes state rather than energy. Icon-first controls keep their section labels and tooltips. Verification is geometric: measure bounds and compare `scrollWidth` with viewport width at each target breakpoint. Blender's HIG keeps common widgets accessible while lesser-used ones step down, which is why file actions keep labels on desktop and collapse below 1280px. The `ui-ux-pro-max` violet/cyan default is rejected because this world has one amber accent and the pinned brief wins over a style default.

Scope: `docs/specs/SPEC.ui-dense-tool.md` supersedes the precision spec where the two disagree. The earlier spec stays authoritative everywhere else.
