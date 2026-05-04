import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  Briefcase, ChartLineUp, FileText, Money, Scales, TrendUp, Calculator,
  ArrowsLeftRight, Timeline, TrendDown, CurrencyDollar, Wallet, Bank,
  Percent, ChartBar, Receipt, ChartPie, Gauge, Stack, HardHat, Activity,
  CreditCard,
} from "@phosphor-icons/react";

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const IconBriefcase = wd(Briefcase);
export const IconAnalysis = wd(ChartLineUp);
export const IconIncomeStatement = wd(FileText);
export const IconCashFlow = wd(Money);
export const IconBalanceSheet = wd(Scales);
export const IconInvestment = wd(TrendUp);
export const IconCalculator = wd(Calculator);
export const IconCompare = wd(ArrowsLeftRight);
export const IconTimeline = wd(Timeline);
export const IconTrending = wd(TrendUp);
export const IconTrendingUp = wd(TrendUp);
export const IconTrendingDown = wd(TrendDown);
export const IconDollarSign = wd(CurrencyDollar);
export const IconWallet = wd(Wallet);
export const IconLandmark = wd(Bank);
export const IconScale = wd(Scales);
export const IconPercent = wd(Percent);
export const IconBarChart2 = wd(ChartBar);
export const IconBarChart3 = wd(ChartBar);
export const IconBanknote = wd(Money);
export const IconCreditCard = wd(CreditCard);
export const IconReceipt = wd(Receipt);
export const IconPieChart = wd(ChartPie);
export const IconGauge = wd(Gauge);
export const IconLayers = wd(Stack);
export const IconPPE = wd(HardHat);
export const IconActivity = wd(Activity);
