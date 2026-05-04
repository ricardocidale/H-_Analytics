import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  Flask, UsersThree, UserGear, User, Users, UserCircle, TextT, Square,
  PaintBrush, Bathtub, ForkKnife, Waves, Tree, Translate, Ruler,
  CursorClick,
} from "@phosphor-icons/react";

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const IconResearch = wd(Flask);
export const IconPeople = wd(UsersThree);
export const IconUserCog = wd(UserGear);
export const IconUser = wd(User);
export const IconUsers = wd(Users);
export const IconUserCircle = wd(UserCircle);
export const IconType = wd(TextT);
export const IconSquare = wd(Square);
export const IconPaintbrush = wd(PaintBrush);
export const IconBath = wd(Bathtub);
export const IconUtensilsCrossed = wd(ForkKnife);
export const IconWaves = wd(Waves);
export const IconTrees = wd(Tree);
export const IconFlaskConical = wd(Flask);
export const IconLanguages = wd(Translate);
export const IconRuler = wd(Ruler);
export const IconMousePointerClick = wd(CursorClick);
