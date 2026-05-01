// Exit Value Calculation Analysis
// This script traces through the exact formulas used in Dashboard.tsx

const global = {
  modelStartDate: "2026-04-01",
  commissionRate: 0.06,
  debtAssumptions: {
    acqLTV: 0.75,
    interestRate: 0.09,
    amortizationYears: 25
  }
};

// Casa Medellín - Financed Property
const casaMedellin = {
  name: "Casa Medellín",
  purchasePrice: 3500000,
  buildingImprovements: 800000,
  type: "Financed",
  acquisitionDate: "2028-01-01",
  operationsStartDate: "2028-07-01",
  exitCapRate: 0.085,
  acquisitionLTV: null,
  acquisitionInterestRate: null,
  acquisitionTermYears: null,
  willRefinance: null,
  roomCount: 30,
  startAdr: 180,
  adrGrowthRate: 0.04
};

// Blue Ridge Manor - Financed Property  
const blueRidge = {
  name: "Blue Ridge Manor",
  purchasePrice: 3500000,
  buildingImprovements: 800000,
  type: "Financed",
  acquisitionDate: "2028-01-01",
  operationsStartDate: "2028-07-01",
  exitCapRate: 0.085,
  acquisitionLTV: null,
  acquisitionInterestRate: null,
  acquisitionTermYears: null,
  willRefinance: null,
  roomCount: 30,
  startAdr: 342,
  adrGrowthRate: 0.025
};

// Hudson Estate - Full Equity (no loan)
const hudsonEstate = {
  name: "The Hudson Estate",
  purchasePrice: 2300000,
  buildingImprovements: 800000,
  type: "Full Equity",
  acquisitionDate: "2026-06-01",
  operationsStartDate: "2026-12-01",
  exitCapRate: 0.085,
  roomCount: 20,
  startAdr: 330,
  adrGrowthRate: 0.025
};

function analyzeProperty(prop) {
  console.log("\n" + "=".repeat(60));
  console.log(`PROPERTY: ${prop.name}`);
  console.log("=".repeat(60));
  
  // Step 1: Calculate Loan Amount
  const loanAmount = prop.type === "Financed" 
    ? (prop.purchasePrice + prop.buildingImprovements) * (prop.acquisitionLTV || global.debtAssumptions.acqLTV)
    : 0;
  
  console.log(`\n--- STEP 1: LOAN CALCULATION ---`);
  console.log(`Property Type: ${prop.type}`);
  console.log(`Purchase Price: $${prop.purchasePrice.toLocaleString()}`);
  console.log(`Building Improvements: $${prop.buildingImprovements.toLocaleString()}`);
  console.log(`Total Basis: $${(prop.purchasePrice + prop.buildingImprovements).toLocaleString()}`);
  if (loanAmount > 0) {
    console.log(`LTV: ${((prop.acquisitionLTV || global.debtAssumptions.acqLTV) * 100).toFixed(0)}%`);
    console.log(`Loan Amount: $${loanAmount.toLocaleString()}`);
  } else {
    console.log(`No loan (Full Equity)`);
  }
  
  // Step 2: Simulate Year 10 NOI (simplified estimate)
  // In reality, the financial engine calculates this monthly
  // For this analysis, we'll estimate based on a stabilized year
  const occupancy = 0.9; // Stabilized
  const daysPerYear = 365;
  const roomNights = prop.roomCount * daysPerYear * occupancy;
  
  // ADR grows at adrGrowthRate per year, compound over ~8 years to year 10
  const yearsToYear10 = 8; // Property operates ~2 years before model starts for some
  const year10ADR = prop.startAdr * Math.pow(1 + prop.adrGrowthRate, yearsToYear10);
  const roomsRevenue = roomNights * year10ADR;
  
  // Estimate total revenue with F&B and events (rough estimate)
  // Revenue multiplier accounts for ~43% events + ~22% F&B + ~7% other revenue shares
  const ESTIMATED_REVENUE_MULTIPLIER = 1.5;
  const totalRevenue = roomsRevenue * ESTIMATED_REVENUE_MULTIPLIER;
  
  // Operating expenses (sum of cost rates)
  const totalCostRate = 0.36 + 0.15 + 0.08 + 0.05 + 0.04 + 0.05 + 0.02 + 0.03 + 0.02 + 0.04 + 0.05;
  const operatingExpenses = totalRevenue * totalCostRate;
  
  // Management fees
  const baseFee = totalRevenue * 0.05;
  const gop = totalRevenue - operatingExpenses;
  const incentiveFee = gop * 0.15;
  
  // NOI
  const estimatedYear10NOI = totalRevenue - operatingExpenses - baseFee - incentiveFee;
  
  console.log(`\n--- STEP 2: YEAR 10 NOI ESTIMATE ---`);
  console.log(`Room Count: ${prop.roomCount}`);
  console.log(`Start ADR: $${prop.startAdr}`);
  console.log(`Year 10 ADR (estimated): $${year10ADR.toFixed(2)}`);
  console.log(`Occupancy: ${(occupancy * 100).toFixed(0)}%`);
  console.log(`Room Nights: ${roomNights.toLocaleString()}`);
  console.log(`Rooms Revenue (estimated): $${roomsRevenue.toLocaleString()}`);
  console.log(`Total Revenue (estimated): $${totalRevenue.toLocaleString()}`);
  console.log(`Operating Expenses: $${operatingExpenses.toLocaleString()}`);
  console.log(`Management Fees: $${(baseFee + incentiveFee).toLocaleString()}`);
  console.log(`Year 10 NOI (estimated): $${estimatedYear10NOI.toLocaleString()}`);
  
  // Step 3: Calculate Gross Property Value
  const grossValue = estimatedYear10NOI / prop.exitCapRate;
  
  console.log(`\n--- STEP 3: GROSS PROPERTY VALUE ---`);
  console.log(`Exit Cap Rate: ${(prop.exitCapRate * 100).toFixed(1)}%`);
  console.log(`Formula: Year 10 NOI / Exit Cap Rate`);
  console.log(`Calculation: $${estimatedYear10NOI.toLocaleString()} / ${prop.exitCapRate}`);
  console.log(`Gross Value: $${grossValue.toLocaleString()}`);
  
  // Step 4: Deduct Commission
  const commission = grossValue * global.commissionRate;
  const netValueAfterCommission = grossValue - commission;
  
  console.log(`\n--- STEP 4: COMMISSION DEDUCTION ---`);
  console.log(`Commission Rate: ${(global.commissionRate * 100).toFixed(0)}%`);
  console.log(`Commission: $${commission.toLocaleString()}`);
  console.log(`Net Value After Commission: $${netValueAfterCommission.toLocaleString()}`);
  
  // Step 5: Calculate Outstanding Loan Balance at Year 10
  let outstandingBalance = 0;
  if (loanAmount > 0) {
    const annualRate = prop.acquisitionInterestRate || global.debtAssumptions.interestRate;
    const r = annualRate / 12;
    const termYears = prop.acquisitionTermYears || global.debtAssumptions.amortizationYears;
    const n = termYears * 12;
    
    // Monthly payment
    const monthlyPayment = (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    
    // Calculate months of payments made by end of Year 10
    // afterYear = 9 (Year 10 is index 9)
    // monthsPaid = (9 + 1) * 12 = 120 months from model start
    // But the loan only starts at acquisition date
    
    // Actually, the code uses a simpler approach:
    // monthsPaid = (afterYear + 1) * 12 = 120 months
    // This assumes loan starts at model start, which may not be correct for properties acquired later
    
    // CORRECTED logic: Account for when property was actually acquired
    const afterYear = 9;
    const modelStart = new Date(global.modelStartDate);
    const acqDate = new Date(prop.acquisitionDate);
    const acqMonthsFromModelStart = (acqDate.getFullYear() - modelStart.getFullYear()) * 12 + 
                                     (acqDate.getMonth() - modelStart.getMonth());
    const endOfYearMonth = (afterYear + 1) * 12;
    const monthsPaid = Math.max(0, endOfYearMonth - Math.max(0, acqMonthsFromModelStart));
    const paymentsRemaining = Math.max(0, n - monthsPaid);
    
    console.log(`   Acquisition Date: ${prop.acquisitionDate}`);
    console.log(`   Model Start Date: ${global.modelStartDate}`);
    console.log(`   Months from Model Start to Acquisition: ${acqMonthsFromModelStart}`);
    
    if (paymentsRemaining > 0) {
      outstandingBalance = monthlyPayment * (1 - Math.pow(1 + r, -paymentsRemaining)) / r;
    }
    
    console.log(`\n--- STEP 5: OUTSTANDING LOAN BALANCE ---`);
    console.log(`Interest Rate: ${(annualRate * 100).toFixed(1)}%`);
    console.log(`Term: ${termYears} years (${n} months)`);
    console.log(`Monthly Rate (r): ${(r * 100).toFixed(4)}%`);
    console.log(`Monthly Payment: $${monthlyPayment.toLocaleString()}`);
    console.log(`Months Paid (model logic): ${monthsPaid}`);
    console.log(`Payments Remaining: ${paymentsRemaining}`);
    console.log(`Outstanding Balance: $${outstandingBalance.toLocaleString()}`);
    
    // Show amortization check
    console.log(`\n   Amortization Verification:`);
    console.log(`   Total Payments Over ${termYears} Years: $${(monthlyPayment * n).toLocaleString()}`);
    console.log(`   Principal: $${loanAmount.toLocaleString()}`);
    console.log(`   Total Interest: $${((monthlyPayment * n) - loanAmount).toLocaleString()}`);
  } else {
    console.log(`\n--- STEP 5: OUTSTANDING LOAN BALANCE ---`);
    console.log(`No loan to pay off (Full Equity property)`);
  }
  
  // Step 6: Final Exit Value
  const exitValue = netValueAfterCommission - outstandingBalance;
  
  console.log(`\n--- STEP 6: FINAL EXIT VALUE ---`);
  console.log(`Formula: Gross Value - Commission - Outstanding Debt`);
  console.log(`Calculation: $${grossValue.toLocaleString()} - $${commission.toLocaleString()} - $${outstandingBalance.toLocaleString()}`);
  console.log(`Exit Value: $${exitValue.toLocaleString()}`);
  
  // Summary
  console.log(`\n--- SUMMARY ---`);
  console.log(`| Gross Value (NOI/Cap)     | $${grossValue.toLocaleString().padStart(15)} |`);
  console.log(`| Less: Commission (${(global.commissionRate*100).toFixed(0)}%)    | $${(-commission).toLocaleString().padStart(15)} |`);
  console.log(`| Less: Outstanding Debt    | $${(-outstandingBalance).toLocaleString().padStart(15)} |`);
  console.log(`|---------------------------|-------------------|`);
  console.log(`| Net Exit Value            | $${exitValue.toLocaleString().padStart(15)} |`);
  
  return { grossValue, commission, outstandingBalance, exitValue };
}

console.log("\n" + "#".repeat(60));
console.log("EXIT VALUE CALCULATION ANALYSIS");
console.log("Model: L+B Hospitality Group Investor Portal");
console.log("#".repeat(60));
console.log("\nGlobal Settings:");
console.log(`  Commission Rate: ${(global.commissionRate * 100).toFixed(0)}%`);
console.log(`  Default LTV: ${(global.debtAssumptions.acqLTV * 100).toFixed(0)}%`);
console.log(`  Default Interest Rate: ${(global.debtAssumptions.interestRate * 100).toFixed(1)}%`);
console.log(`  Default Term: ${global.debtAssumptions.amortizationYears} years`);

// Analyze each property
analyzeProperty(hudsonEstate);
analyzeProperty(casaMedellin);
analyzeProperty(blueRidge);

console.log("\n" + "#".repeat(60));
console.log("ANALYSIS COMPLETE");
console.log("#".repeat(60));
console.log("\nNOTES:");
console.log("1. Year 10 NOI values above are ESTIMATES for illustration.");
console.log("   The actual values come from the financial engine's monthly calculations.");
console.log("2. Commission is deducted from gross value BEFORE debt payoff.");
console.log("3. For financed properties, outstanding loan balance is calculated using");
console.log("   the present value of remaining payments formula.");
console.log("4. Exit Value = Gross Value - Commission - Outstanding Debt");
