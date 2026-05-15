# Add a shadcn/ui Component

## Steps

1. Install: `npx shadcn@latest add <component-name>`
2. Component lands in `components/ui/<name>.tsx`
3. Import via `@/components/ui/<name>`
4. Use `cn()` from `lib/utils.ts` for conditional classes

## Config

- shadcn config: `components.json` (style: new-york, base: zinc, rsc: true)
- Icon library: Lucide
- CSS variables enabled — theme tokens in `app/globals.css`

## Reminders

- Always use the CLI — do NOT manually create shadcn components
- Dark mode is the default theme
