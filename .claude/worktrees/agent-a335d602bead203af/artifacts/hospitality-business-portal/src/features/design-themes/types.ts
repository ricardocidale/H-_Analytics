export interface DesignColor {
  rank: number;
  name: string;
  hexCode: string;
  description: string;
}

export interface DesignTheme {
  id: number;
  name: string;
  description: string;
  colors: DesignColor[];
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}
