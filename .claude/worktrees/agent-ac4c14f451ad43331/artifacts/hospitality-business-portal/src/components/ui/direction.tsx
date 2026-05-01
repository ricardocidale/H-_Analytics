import * as React from "react";

type Direction = "ltr" | "rtl";

const DirectionContext = React.createContext<Direction>("ltr");

export function DirectionProvider({
  children,
  direction = "ltr",
}: {
  children: React.ReactNode;
  direction?: Direction;
}) {
  return (
    <DirectionContext.Provider value={direction}>
      <div dir={direction}>{children}</div>
    </DirectionContext.Provider>
  );
}

export function useDirection(): Direction {
  return React.useContext(DirectionContext);
}
