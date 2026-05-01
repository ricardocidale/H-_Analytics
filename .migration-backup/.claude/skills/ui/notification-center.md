---
name: notification-center
description: Bell icon notification center for research status, model alerts, scenario changes. Use when implementing notifications.
theme: dark-glass
---

# Notification Center

## Theme: Dark Glass (Midnight)
The notification popover uses the **dark glass** theme matching the sidebar aesthetic.

### Bell Button (header)
```
relative p-2 rounded-xl text-[#FFF9F5]/60 hover:text-white
hover:bg-white/8 transition-all duration-300
```

### Unread Badge
```
absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full
bg-gradient-to-br from-[#F4795B] to-[#EF4444]
text-[10px] text-white font-bold flex items-center justify-center
```

### Popover Panel
```
bg-[#0a0a0f]/95 backdrop-blur-xl border border-[#9FBCA4]/20
rounded-2xl shadow-2xl w-80 max-h-96 overflow-hidden
```

### Panel Header
```
px-4 py-3 border-b border-white/10 flex items-center justify-between
text-white font-semibold text-sm
```

### Mark All Read Button
```
text-xs text-[#9FBCA4] hover:text-white transition-colors
```

### Notification Item (unread)
```
px-4 py-3 border-b border-white/5 bg-white/[0.03]
hover:bg-white/8 transition-colors cursor-pointer
```

### Notification Item (read)
```
px-4 py-3 border-b border-white/5 opacity-60
hover:bg-white/5 transition-colors cursor-pointer
```

### Type Icons & Colors
| Type | Icon | Accent Color |
|------|------|-------------|
| research | Search | `text-blue-400` |
| alert | AlertTriangle | `text-amber-400` |
| scenario | GitBranch | `text-purple-400` |
| export | Download | `text-emerald-400` |
| system | Info | `text-white/40` |

### Timestamp
```
text-xs text-white/30 mt-1
```

## Store Shape (Zustand)
```typescript
interface Notification {
  id: string;
  type: 'research' | 'alert' | 'scenario' | 'export' | 'system';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
}
```

## Integration
- Mounted in `Layout.tsx` header, right side next to user card
- Research refresh pushes notifications on completion
- Verification runner pushes notification with opinion result
- Export functions push notification on success
