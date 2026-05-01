# Portfolio Components

## Architecture
Portfolio.tsx is a ~200-line shell that handles queries, mutations, form state, and grid layout. Sub-components are extracted into `client/src/components/portfolio/`.

## File Map
| File | Purpose | Lines |
|------|---------|-------|
| `Portfolio.tsx` | Shell: queries, mutations, form state, grid layout | ~200 |
| `AddPropertyDialog.tsx` | Multi-section property creation form dialog | ~280 |
| `PortfolioPropertyCard.tsx` | Glassmorphism property card with status badge and actions | ~115 |
| `CurrencyInput.tsx` | Reusable currency formatting input | ~65 |
| `index.ts` | Barrel export | ~4 |

## Prop Interfaces

### AddPropertyDialog
```ts
interface AddPropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: AddPropertyFormData;
  setFormData: React.Dispatch<React.SetStateAction<AddPropertyFormData>>;
  onSubmit: () => void;
  isPending: boolean;
  onCancel: () => void;
  onAcquisitionDateChange: (date: string) => void;
  trigger: React.ReactNode;
}
```

### PortfolioPropertyCard
```ts
interface PortfolioPropertyCardProps {
  property: Property;       // from @shared/schema
  onDelete: (id: number, name: string) => void;
}
```

### CurrencyInput
```ts
interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  id: string;
  testId: string;
  placeholder?: string;  // defaults to "$0"
}
```

## CurrencyInput Reuse Guide
`CurrencyInput` is a standalone component that formats currency values with thousand separators and a `$` prefix. It can be reused anywhere a dollar-amount input is needed:
```tsx
import { CurrencyInput } from "@/components/portfolio";
<CurrencyInput id="price" testId="input-price" value={price} onChange={setPrice} />
```

## AddPropertyFormData
Exported type from `AddPropertyDialog.tsx` containing all form fields for new property creation. Used as the state shape in Portfolio.tsx.
