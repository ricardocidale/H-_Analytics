# Add a New API Route

## Steps

1. Define the Zod input schema in `lib/validations/<domain>.ts`
2. Create the Route Handler at `app/api/<path>/route.ts`
3. Use `jsonOk()` / `jsonErr()` from `lib/http/api-response.ts`
4. Domain logic goes in `lib/` (NOT inline in the route handler)
5. Run `npm run build` to verify

## Response Envelope

```typescript
import { jsonOk, jsonErr } from "@/lib/http/api-response";

// Success
return jsonOk({ items }, 200);

// Error
return jsonErr("Not found", 404, "NOT_FOUND");
```

## Reminders

- All routes behind Clerk auth by default (middleware.ts)
- Long-running routes: set `export const maxDuration = 300`
