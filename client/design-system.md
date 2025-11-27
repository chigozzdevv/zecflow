# Design System & Visual Identity

## 1. Visual Identity & Vibe
*   **Theme:** Tech-Forward / Cyberpunk / Web3
*   **Mode:** Dark Mode Only
*   **Aesthetics:** High contrast, neon accents, deep backgrounds, technical feel.

## 2. Color Palette
*   **Backgrounds:**
    *   `bg-black` (#000000) - Main background
    *   `bg-zinc-900` - Secondary background / Cards
    *   `bg-zinc-800` - Borders / Separators
*   **Primary Accents (Purple):**
    *   `text-purple-500` - Primary text highlight
    *   `bg-purple-600` - Primary buttons / Active states
    *   `border-purple-500` - Focus rings / Active borders
*   **Text:**
    *   `text-white` - Headings / Primary text
    *   `text-zinc-400` - Secondary text / Metadata
    *   `text-zinc-600` - Disabled / Placeholder

## 3. Typography
*   **Font Family:** `JetBrains Mono` (Monospace)
*   **Usage:** Used for both headings and body text to maintain a technical, code-centric look.
*   **Weights:**
    *   Regular (400) - Body text
    *   Medium (500) - Interactive elements
    *   Bold (700) - Headings

## 4. Layout Structure
*   **Navigation:** Top Navigation Bar
    *   Fixed at the top.
    *   Contains Logo, Main Links, and User Profile/Actions.
*   **Content Area:** Centered container with max-width.
*   **Grid System:** 12-column grid for dashboard widgets.

## 5. Component Library Strategy
*   **Core:** Tailwind CSS for styling.
*   **Interactive Primitives:** Headless UI (React) for accessible, unstyled components (Menu, Listbox, Switch, Dialog, etc.).
*   **Icons:** Lucide React (or similar technical icon set).

## 6. Implementation Details
*   **Tailwind Config:** Extend the default theme to include custom colors and the font family.
*   **Global Styles:** Set default background color to black and text color to white in `index.css`.
*   **Font Loading:** Import JetBrains Mono via Google Fonts in `index.html` or CSS.