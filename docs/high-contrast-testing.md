# High Contrast Mode Testing Process

To ensure accessibility for all users, all components must be tested in High Contrast Mode (or Windows High Contrast Mode/Forced Colors Mode) before being merged into the main branch. This guarantees that elements remain visible and usable when user-defined system colors override site CSS.

## 1. What is High Contrast Mode?

High Contrast Mode (also exposed via the `forced-colors` CSS media feature) forces a user's chosen system color palette on web content. This improves contrast and legibility for users with vision impairments. When active, it strips background images, box shadows, and forces specific colors for backgrounds, text, and borders.

## 2. Testing Environments

You should test your components using at least one of the following methods:

### Method A: Emulate in Chrome/Edge DevTools (Recommended)
1. Open the Developer Tools (F12 or Ctrl+Shift+I).
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Menu.
3. Type "Rendering" and select **Show Rendering**.
4. Scroll down to the **Emulate CSS media feature forced-colors** dropdown.
5. Select **forced-colors: active**.
6. (Optional) Also test under different themes using the **Emulate CSS prefers-color-scheme** option to ensure light/dark system colors behave as expected.

### Method B: Windows High Contrast Mode (Native)
1. On Windows 10/11, go to **Settings > Accessibility > Contrast themes** (or High contrast).
2. Select a theme (e.g., Aquatic, Desert, Dusk, Night sky) and apply it.
3. Open the application in your browser (Edge or Chrome) and verify the components.

## 3. What to Look For (Checklist)

When High Contrast Mode is enabled, verify the following:

- [ ] **Text Legibility**: Text should have sufficient contrast against the background and shouldn't blend in.
- [ ] **Borders**: Component boundaries (cards, modals, form inputs) must remain visible.
- [ ] **Interactive Elements**: Buttons and links should look interactive (often underlined or distinct color).
- [ ] **Focus Indicators**: When tabbing through elements, the focus ring MUST be clearly visible. Box shadows are often disabled in high contrast mode, so rely on `outline`.
- [ ] **Icons**: SVG icons using `fill="currentColor"` or similar techniques should adapt to the text color. SVGs with hardcoded fills might disappear against the background.
- [ ] **State Changes**: Hover, active, disabled, and selected states must be visually distinguishable.

## 4. Implementation Guidelines

If you find issues during testing, follow these best practices in your CSS:

1. **Use `outline` or `border` instead of `box-shadow`**: High Contrast Mode often removes `box-shadow`. If you rely on shadows for focus rings, add a transparent outline that will become visible in High Contrast Mode.
   ```css
   .button:focus-visible {
     outline: 2px solid transparent; /* Becomes visible in HCM */
   }
   ```
2. **Use `@media (forced-colors: active)`**: Target High Contrast Mode explicitly if you need custom fixes.
   ```css
   @media (forced-colors: active) {
     .my-component {
       border: 1px solid CanvasText;
     }
   }
   ```
3. **Use System Colors**: Inside forced-colors media queries, use system colors like `Canvas`, `CanvasText`, `Highlight`, and `LinkText`.
4. **CurrentColor for SVGs**: Ensure SVGs inherit the text color using `fill="currentColor"`.

## 5. Integrating with CI

While visual regressions for High Contrast Mode are difficult to automate completely, we require developers to manually verify new interactive components using the DevTools emulator before submitting a Pull Request. Add the testing steps to your PR checklist.
