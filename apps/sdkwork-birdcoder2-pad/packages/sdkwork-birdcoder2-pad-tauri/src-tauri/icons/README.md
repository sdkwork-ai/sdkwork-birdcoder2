# src-tauri/icons/

Tablet icon source and derived sizes for the Tauri bundle.

Required families:

- iPadOS app icon set (1024 source, generated sizes, no transparency in the store icon).
- Android adaptive icon: foreground, background, monochrome layers, and legacy density
  variants.
- Shared 32/128 px desktop-tooling previews used by the bundler.

Icons must not be scaled phone assets. Keep the source in `../../assets/media/` and generate
target sizes into this directory from the approved asset pipeline.