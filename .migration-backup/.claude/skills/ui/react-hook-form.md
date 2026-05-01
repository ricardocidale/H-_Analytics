# React Hook Form with shadcn/ui Field Components

## Overview

Forms use React Hook Form + Zod validation + shadcn `<Field />` component system. Both `field.tsx` and `input-group.tsx` are already installed at `client/src/components/ui/`.

## Key Imports

```tsx
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useFieldArray } from "react-hook-form"
import * as z from "zod"

import {
  Field, FieldContent, FieldDescription, FieldError,
  FieldGroup, FieldLabel, FieldLegend, FieldSeparator,
  FieldSet, FieldTitle,
} from "@/components/ui/field"
import {
  InputGroup, InputGroupAddon, InputGroupButton,
  InputGroupInput, InputGroupText, InputGroupTextarea,
} from "@/components/ui/input-group"
```

## Basic Form Pattern

```tsx
const formSchema = z.object({
  title: z.string().min(5).max(32),
})

export function MyForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "" },
  })

  function onSubmit(data: z.infer<typeof formSchema>) { ... }

  return (
    <form id="my-form" onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="title"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="my-form-title">Title</FieldLabel>
              <Input {...field} id="my-form-title" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  )
}
```

## Anatomy Rules

- `<Field data-invalid={fieldState.invalid}>` — always set on wrapper
- `aria-invalid={fieldState.invalid}` — always set on the input/control
- `<FieldError errors={[fieldState.error]} />` — shown conditionally
- `<FieldDescription>` — helper text, always visible
- Use `form id` + `<Button form="form-id">` to submit from `<CardFooter>`

## Field Types

### Input
```tsx
<Input {...field} id={field.name} aria-invalid={fieldState.invalid} />
```

### Textarea
```tsx
<Textarea {...field} id={field.name} aria-invalid={fieldState.invalid} className="min-h-[120px]" />
```

### Textarea with character count (InputGroup)
```tsx
<InputGroup>
  <InputGroupTextarea {...field} rows={6} className="min-h-24 resize-none" aria-invalid={fieldState.invalid} />
  <InputGroupAddon align="block-end">
    <InputGroupText className="tabular-nums">{field.value.length}/100 characters</InputGroupText>
  </InputGroupAddon>
</InputGroup>
```

### Select
```tsx
<Select name={field.name} value={field.value} onValueChange={field.onChange}>
  <SelectTrigger id={field.name} aria-invalid={fieldState.invalid}>
    <SelectValue placeholder="Select" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="en">English</SelectItem>
  </SelectContent>
</Select>
```

### Checkbox (single)
```tsx
<Checkbox
  id="my-checkbox"
  name={field.name}
  checked={field.value}
  onCheckedChange={field.onChange}
/>
```

### Checkbox array — add `data-slot="checkbox-group"` to `<FieldGroup>`
```tsx
<FieldSet>
  <FieldLegend variant="label">Options</FieldLegend>
  <FieldGroup data-slot="checkbox-group">
    {items.map((item) => (
      <Field key={item.id} orientation="horizontal" data-invalid={fieldState.invalid}>
        <Checkbox
          id={`field-${item.id}`}
          checked={field.value.includes(item.id)}
          onCheckedChange={(checked) => {
            const next = checked
              ? [...field.value, item.id]
              : field.value.filter((v) => v !== item.id)
            field.onChange(next)
          }}
          aria-invalid={fieldState.invalid}
        />
        <FieldLabel htmlFor={`field-${item.id}`} className="font-normal">{item.label}</FieldLabel>
      </Field>
    ))}
  </FieldGroup>
  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
</FieldSet>
```

### Radio Group
```tsx
<RadioGroup name={field.name} value={field.value} onValueChange={field.onChange} aria-invalid={fieldState.invalid}>
  {options.map((opt) => (
    <FieldLabel key={opt.id} htmlFor={`field-${opt.id}`}>
      <Field orientation="horizontal" data-invalid={fieldState.invalid}>
        <FieldContent>
          <FieldTitle>{opt.title}</FieldTitle>
          <FieldDescription>{opt.description}</FieldDescription>
        </FieldContent>
        <RadioGroupItem value={opt.id} id={`field-${opt.id}`} aria-invalid={fieldState.invalid} />
      </Field>
    </FieldLabel>
  ))}
</RadioGroup>
```

### Switch
```tsx
<Field orientation="horizontal" data-invalid={fieldState.invalid}>
  <FieldContent>
    <FieldLabel htmlFor="my-switch">Label</FieldLabel>
    <FieldDescription>Helper text</FieldDescription>
    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
  </FieldContent>
  <Switch id="my-switch" name={field.name} checked={field.value} onCheckedChange={field.onChange} aria-invalid={fieldState.invalid} />
</Field>
```

### Responsive layout (label + control side-by-side on wide screens)
```tsx
<Field orientation="responsive" data-invalid={fieldState.invalid}>
  <FieldContent>
    <FieldLabel>...</FieldLabel>
    <FieldDescription>...</FieldDescription>
    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
  </FieldContent>
  {/* control on the right */}
</Field>
```

## Array Fields (useFieldArray)

```tsx
const { fields, append, remove } = useFieldArray({ control: form.control, name: "emails" })

// Always use field.id as the key (not index)
{fields.map((field, index) => (
  <Controller
    key={field.id}
    name={`emails.${index}.address`}
    control={form.control}
    render={({ field: cf, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <InputGroup>
          <InputGroupInput {...cf} type="email" aria-invalid={fieldState.invalid} />
          {fields.length > 1 && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="button" variant="ghost" size="icon-xs" onClick={() => remove(index)}>
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
      </Field>
    )}
  />
))}

<Button type="button" variant="outline" size="sm" onClick={() => append({ address: "" })} disabled={fields.length >= 5}>
  Add Email
</Button>

{/* Array-level error (root) */}
{form.formState.errors.emails?.root && (
  <FieldError errors={[form.formState.errors.emails.root]} />
)}
```

## Validation Modes

```tsx
const form = useForm({ resolver: zodResolver(schema), mode: "onChange" })
// "onChange" | "onBlur" | "onSubmit" (default) | "onTouched" | "all"
```

## Reset

```tsx
<Button type="button" variant="outline" onClick={() => form.reset()}>Reset</Button>
```

## CardFooter Submit Pattern

```tsx
// form has id, submit button references it
<CardContent>
  <form id="my-form" onSubmit={form.handleSubmit(onSubmit)}>...</form>
</CardContent>
<CardFooter>
  <Field orientation="horizontal">
    <Button type="button" variant="outline" onClick={() => form.reset()}>Reset</Button>
    <Button type="submit" form="my-form">Save</Button>
  </Field>
</CardFooter>
```
