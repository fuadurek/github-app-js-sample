import pkg from 'technicalindicators';
const { rsi, ema, macd, atr, adx, mfi } = pkg;

console.log("Trading Analysis Tool Initializing...");

async function calculateRSI(prices, period) {
  if (!prices || prices.length < period) {
    console.error("Error: Not enough price data for the given period.");
    return [];
  }

  try {
    const rsiResult = rsi({ values: prices, period: period });
    return rsiResult;
  } catch (error) {
    console.error("Error calculating RSI:", error);
    return [];
  }
}

async function calculateMACD(prices, fastPeriod, slowPeriod, signalPeriod) {
  // MACD requires enough data for the slow period, plus enough for the signal period calculation on top of MACD line.
  // The library itself handles internal calculations, but a common check is for slowPeriod.
  // The `macd` function in `technicalindicators` needs at least `slowPeriod + signalPeriod - 1` prices
  // to output the first full MACD set (MACD, signal, histogram).
  if (!prices || prices.length < slowPeriod + signalPeriod -1) {
    console.error(`Error: Not enough price data for MACD calculation. Need at least ${slowPeriod + signalPeriod -1} prices, have ${prices.length}.`);
    return [];
  }

  try {
    const macdResult = macd({
      values: prices,
      fastPeriod: fastPeriod,
      slowPeriod: slowPeriod,
      signalPeriod: signalPeriod,
      SimpleMAOscillator: false, // Use EMA for oscillator
      SimpleMASignal: false     // Use EMA for signal line
    });
    return macdResult;
  } catch (error) {
    console.error("Error calculating MACD:", error);
    return [];
  }
}

async function calculateSupertrendManual(ohlcData, atrPeriod, multiplier) {
  if (!ohlcData || ohlcData.length < atrPeriod) {
    console.error(`Error: Not enough OHLC data for Supertrend calculation. Need at least ${atrPeriod} data points, have ${ohlcData.length}.`);
    return [];
  }

  const high = ohlcData.map(d => d.high);
  const low = ohlcData.map(d => d.low);
  const close = ohlcData.map(d => d.close);

  // Calculate ATR
  // The 'atr' function from technicalindicators returns an array of the same length as the input,
  // with initial values being undefined until period is met.
  // First valid ATR is at index (atrPeriod - 1) of the ATR array,
  // corresponding to ohlcData at index (atrPeriod - 1).
  const atrResults = atr({ high, low, close, period: atrPeriod });

  // console.log("DEBUG ST: ATR Results Length:", atrResults.length); // Cleaned up
  // console.log("DEBUG ST: ATR Results Array (first few and relevant end part):"); // Cleaned up
  // atrResults.forEach((val, idx) => { // Cleaned up
    // if (idx < atrPeriod + 5 || idx >= atrResults.length - (30 - 19)) { // Cleaned up
       // console.log(`DEBUG ST: ATR[${idx}]: ${val}`); // Cleaned up
    // } // Cleaned up
  // }); // Cleaned up
  // console.log("DEBUG ST: Full ATR Results Array:", JSON.stringify(atrResults)); // Cleaned up


  if (ohlcData.length < atrPeriod) {
    console.error("Error: Not enough data to calculate ATR for Supertrend (ohlcData shorter than atrPeriod).");
    return [];
  }
  // The ATR array is shorter than ohlcData. It has (ohlcData.length - atrPeriod + 1) elements if ATR includes the current bar,
  // or (ohlcData.length - atrPeriod) if it's for prior bars.
  // The 'technicalindicators' library's ATR output length is ohlcData.length - (atrPeriod -1) = 30 - 9 = 21 elements.
  // NO, the debug output showed ATR Results Length: 20. This is ohlcData.length - atrPeriod.
  // So, atrResults[0] is ATR for ohlcData[atrPeriod-1+0]... No, this is for ohlcData[atrPeriod].
  // If ATR length is 20, and ohlc is 30, period 10:
  // atrResults[0] is ATR for ohlcData[10] (using data up to ohlcData[10]).
  // The standard is that ATR for bar `i` uses data up to bar `i`.
  // The first bar for which ATR can be calculated is `ohlcData[atrPeriod - 1]`.
  // So, `atrResults[0]` should correspond to `ohlcData[atrPeriod - 1]`.
  // And `atrResults` length would be `ohlcData.length - (atrPeriod - 1)`.
  // If `atrResults.length` is 20, and `ohlcData.length` is 30, `atrPeriod` is 10: 30 - 10 = 20.
  // This means `atrResults[0]` is the ATR for `ohlcData[9]`.
  // Then `atrResults[19]` is the ATR for `ohlcData[28]`.
  // The loop for `i` goes from `atrPeriod-1` (9) to `ohlcData.length-1` (29).
  // Correct ATR index: `i - (atrPeriod - 1)`.

  const supertrendResult = [];
  let currentSupertrend = 0;
  let supertrendDirection = 'up';

  // Loop for i should go from atrPeriod-1 up to (atrPeriod-1) + atrResults.length -1
  // This ensures we only process ohlcData points for which we have a corresponding ATR value.
  const loopEnd = (atrPeriod - 1) + atrResults.length;
  for (let i = atrPeriod -1; i < loopEnd; i++) {
    const atrIndex = i - (atrPeriod - 1);
    const currentAtr = atrResults[atrIndex];

    if (currentAtr === undefined || currentAtr === null || isNaN(currentAtr)) {
      // This condition should ideally not be met if logic is correct and ATR lib consistent
      console.warn(`WARN ST: Invalid ATR at ohlcData index ${i} (ATR index ${atrIndex}). ATR: ${currentAtr}.`);
      supertrendResult.push({ value: null, direction: (supertrendResult.length > 0 ? supertrendResult[supertrendResult.length-1].direction : 'N/A'), ohlc: ohlcData[i] });
      continue;
    }

    const ohlc = ohlcData[i];
    const prevOhlc = i > 0 ? ohlcData[i-1] : null; // Needed for close comparison in some logic
                                                  // but standard ST uses prev ST value, not prev close directly for flip.

    const basicUpperband = ((ohlc.high + ohlc.low) / 2) + multiplier * currentAtr;
    const basicLowerband = ((ohlc.high + ohlc.low) / 2) - multiplier * currentAtr;

    if (supertrendResult.length === 0) { // First valid Supertrend point
      // Initial direction based on close vs basicUpperband (common heuristic)
      // Some ST initialize based on price relative to (H+L)/2 or other methods.
      // A common initial rule: if close > basicUpperband, trend is up, use basicLowerband. Else down, use basicUpperband.
      // This interpretation is ambiguous in many descriptions. Let's use a simpler one:
      // Set initial based on close > mid-price, then refine.
      // Or, more commonly: first point uses basic bands to set trend.
      if (ohlc.close > basicUpperband) {
         supertrendDirection = 'up';
         currentSupertrend = basicLowerband;
      } else if (ohlc.close < basicLowerband) {
         supertrendDirection = 'down';
         currentSupertrend = basicUpperband;
      } else { // Close is between bands, common to assign to lower for up or upper for down
         supertrendDirection = 'up'; // Defaulting if in between
         currentSupertrend = basicLowerband;
      }
    } else {
      const prevSupertrendData = supertrendResult[supertrendResult.length - 1];
      const prevSupertrendValue = prevSupertrendData.value;
      const prevSupertrendDirection = prevSupertrendData.direction;

      if (prevSupertrendDirection === 'up') {
        if (ohlc.close > prevSupertrendValue) {
          currentSupertrend = Math.max(basicLowerband, prevSupertrendValue);
          supertrendDirection = 'up';
        } else { // Close crosses below previous Supertrend
          currentSupertrend = basicUpperband;
          supertrendDirection = 'down';
        }
      } else { // prevSupertrendDirection === 'down'
        if (ohlc.close < prevSupertrendValue) {
          currentSupertrend = Math.min(basicUpperband, prevSupertrendValue);
          supertrendDirection = 'down';
        } else { // Close crosses above previous Supertrend
          currentSupertrend = basicLowerband;
          supertrendDirection = 'up';
        }
      }
    }
    supertrendResult.push({ value: currentSupertrend, direction: supertrendDirection, ohlc: ohlcData[i], atr: currentAtr });
  }
  return supertrendResult;
}

async function calculateMFI(ohlcvData, period) {
  // MFI calculation involves comparing current typical price with previous,
  // and then summing positive/negative money flow over the period.
  // Needs at least `period` data points for typical price and money flow calculation,
  // and one previous data point to compare typical prices. So, `period + 1` total data points.
  if (!ohlcvData || ohlcvData.length < period + 1) {
    console.error(`Error: Not enough OHLCV data for MFI calculation with period ${period}. Need at least ${period + 1} data points, have ${ohlcvData.length}.`);
    return [];
  }

  const high = ohlcvData.map(d => d.high);
  const low = ohlcvData.map(d => d.low);
  const close = ohlcvData.map(d => d.close);
  const volume = ohlcvData.map(d => d.volume);

  try {
    const mfiResult = mfi({ high, low, close, volume, period: period });
    // The mfi function returns an array of MFI values.
    // This array is shorter than the input data, starting from where MFI is calculable.
    // Length: input_length - period.
    return mfiResult;
  } catch (error) {
    console.error("Error calculating MFI:", error);
    return [];
  }
}

async function calculateADX(ohlcData, period) {
  // ADX typically requires (2 * period - 1) data points for the first ADX value.
  // Some sources say at least 'period' data points for +DI/-DI, and then another 'period' for ADX smoothing.
  // Let's use a general check for 2 * period as a minimum.
  if (!ohlcData || ohlcData.length < 2 * period) {
    console.error(`Error: Not enough OHLC data for ADX calculation with period ${period}. Need at least ${2 * period} data points, have ${ohlcData.length}.`);
    return [];
  }

  const high = ohlcData.map(d => d.high);
  const low = ohlcData.map(d => d.low);
  const close = ohlcData.map(d => d.close);

  try {
    const adxResult = adx({ high, low, close, period: period });
    // The adx function returns an array of objects {adx, pdi, mdi}.
    // Initial values in the array will have adx: 0 or NaN until enough data is processed.
    // Specifically, ADX values start after (2 * period - 1) bars. PDI/MDI start after 'period' bars.
    return adxResult;
  } catch (error) {
    console.error("Error calculating ADX:", error);
    return [];
  }
}


async function calculateEMA(prices, period) {
  if (!prices || prices.length < period) {
    console.error(`Error: Not enough price data for EMA calculation with period ${period}. Need ${period} prices, have ${prices.length}.`);
    return [];
  }

  try {
    const emaResult = ema({ values: prices, period: period });
    return emaResult;
  } catch (error) {
    console.error("Error calculating EMA:", error);
    return [];
  }
}

async function checkLongPeriodRSISignals(prices, period) {
  console.log(`\nChecking RSI(${period}) signals...`);
  const rsiValues = await calculateRSI(prices, period);

  if (!rsiValues || rsiValues.length === 0) {
    console.log(`RSI(${period}) Signal: Not enough data to calculate RSI.`);
    return;
  }

  const latestRSI = rsiValues[rsiValues.length - 1];
  console.log(`Latest RSI(${period}) value: ${latestRSI.toFixed(2)}`);

  if (latestRSI > 50) {
    console.log(`RSI(${period}) Signal: Potential BUY`);
  } else if (latestRSI < 50) {
    console.log(`RSI(${period}) Signal: Potential SELL`);
  } else {
    console.log(`RSI(${period}) Signal: Neutral (RSI is 50)`);
  }
}

async function runExample() {
  // console.log("Available indicators in 'technicalindicators' pkg:", Object.keys(pkg)); // Cleaned up
  const samplePrices = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
    45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
    46.21, 46.25, 45.71, 46.45, 47.22, 47.00, 47.23, 47.29, 47.08, 47.38
  ];
  const rsiShortPeriod = 14; // For the original example
  const testLongRSIPeriod = 10; // For testing checkLongPeriodRSISignals with sample data
  const emaPeriod = 10; // For EMA calculation example
  const macdFastPeriod = 12;
  const macdSlowPeriod = 26;
  const macdSignalPeriod = 9;
  const supertrendAtrPeriod = 10;
  const supertrendMultiplier = 3;
  const adxPeriod = 14;
  const mfiPeriod = 14;
  // const intendedLongRSIPeriod = 1000; // The conceptual period for the function's design - commented out as it's not used directly here

  // Generate sample OHLCV data
  const sampleOhlcvData = samplePrices.map((price, index) => ({
    open: samplePrices[index > 0 ? index - 1 : 0], // Dummy open
    high: price * 1.02,
    low: price * 0.98,
    close: price,
    volume: 1000 + (index * 100) + (Math.random() * 100) // Dummy volume
  }));
  // Keep sampleOhlcData for functions that don't need volume
  const sampleOhlcData = sampleOhlcvData.map(({open, high, low, close}) => ({open, high, low, close}));


  console.log(`\nCalculating RSI for ${samplePrices.length} prices with period ${rsiShortPeriod}:`);
  const rsiValues = await calculateRSI(samplePrices, rsiShortPeriod);

  if (rsiValues && rsiValues.length > 0) {
    console.log("\nCalculated RSI values (short period):");
    rsiValues.forEach((value, index) => {
      console.log(`Period ${index + 1}: ${value.toFixed(2)}`);
    });
  } else {
    console.log("Could not calculate RSI values for the short period example.");
  }

  // Call the new function for checking long period RSI signals
  // We use testLongRSIPeriod for the actual calculation with samplePrices,
  // but the function's console logs will refer to intendedLongRSIPeriod conceptually.
  // To be clear, I will make the function log the actual period used for calculation.
  // So, I'll call checkLongPeriodRSISignals with testLongRSIPeriod.
  // If the function should *always* use 1000 internally, that's a different design.
  // Based on "the subtask can use a smaller period (e.g., 10 or 15) for the *sample data execution*
  // but the function should be designed to accept a 1000-period configuration",
  // it implies the function itself should be configurable.

  await checkLongPeriodRSISignals(samplePrices, testLongRSIPeriod);

  // Example of how it might be called if data was sufficient for 1000 period
  // This would likely print "Not enough data" with current samplePrices
  // console.log("\n--- Intended Long Period Call (Expect 'Not enough data') ---");
  // await checkLongPeriodRSISignals(samplePrices, intendedLongRSIPeriod);

  // Calculate and display EMA
  console.log(`\nCalculating EMA for ${samplePrices.length} prices with period ${emaPeriod}:`);
  const emaValues = await calculateEMA(samplePrices, emaPeriod);

  if (emaValues && emaValues.length > 0) {
    console.log("\nCalculated EMA values:");
    emaValues.forEach((value, index) => {
      // EMA typically starts outputting values after the first 'period' minus one data points have passed,
      // but the library might return values padded with previous inputs or start calculation from the first possible point.
      // The technicalindicators library usually returns an array of the same length as input prices,
      // with initial values being less meaningful until enough data is processed.
      // For simplicity, we'll print all returned values.
      console.log(`EMA value ${index + 1}: ${value.toFixed(2)}`);
    });
  } else {
    console.log("Could not calculate EMA values for the example.");
  }

  // Calculate and display MACD
  console.log(`\nCalculating MACD for ${samplePrices.length} prices with Fast=${macdFastPeriod}, Slow=${macdSlowPeriod}, Signal=${macdSignalPeriod}:`);
  // Ensure samplePrices has enough data for MACD (slowPeriod + signalPeriod - 1)
  // Current samplePrices has 30 data points. 26 + 9 - 1 = 34. So, it will trigger the error.
  // Let's adjust the sample data or the MACD periods for the example.
  // For simplicity, let's use shorter periods for the example call to ensure it runs with 30 data points.
  // The function calculateMACD itself is generic.
  // Test MACD periods: Fast: 5, Slow: 10, Signal: 3. Requires 10 + 3 - 1 = 12 data points.
  const testMacdFast = 5;
  const testMacdSlow = 10;
  const testMacdSignal = 3;

  // If we wanted to test the error message for insufficient data for standard MACD:
  // const macdValuesStd = await calculateMACD(samplePrices, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
  // console.log(macdValuesStd); // This would show the error message

  console.log(`Using test MACD periods: Fast=${testMacdFast}, Slow=${testMacdSlow}, Signal=${testMacdSignal}`);
  const macdValues = await calculateMACD(samplePrices, testMacdFast, testMacdSlow, testMacdSignal);

  if (macdValues && macdValues.length > 0) {
    console.log("\nCalculated MACD values (MACD | Signal | Histogram):");
    macdValues.forEach((value, index) => {
      // The MACD result from technicalindicators is an array of objects,
      // each object containing MACD, signal, and histogram properties.
      // These values are typically undefined until enough data points are processed.
      if (value.MACD !== undefined) { // Check if MACD value is calculated
        console.log(
          `Set ${index + 1}: ${value.MACD ? value.MACD.toFixed(2) : 'N/A'} | ${
            value.signal ? value.signal.toFixed(2) : 'N/A'
          } | ${value.histogram ? value.histogram.toFixed(2) : 'N/A'}`
        );
      }
    });
  } else {
    console.log("Could not calculate MACD values for the example, or not enough data for the given periods.");
  }

  // Calculate and display Manual Supertrend
  console.log(`\nCalculating Manual Supertrend for ${sampleOhlcData.length} data points with ATR Period=${supertrendAtrPeriod}, Multiplier=${supertrendMultiplier}:`);
  const supertrendManualValues = await calculateSupertrendManual(sampleOhlcData, supertrendAtrPeriod, supertrendMultiplier);

  if (supertrendManualValues && supertrendManualValues.length > 0) {
    console.log("\nCalculated Manual Supertrend values (Value | Direction):");
    supertrendManualValues.forEach((st, index) => {
      // The loop for ST calculation starts from atrPeriod-1, so results align with ohlcData from that index onwards.
      // The result array length will be ohlcData.length - (supertrendAtrPeriod -1)
      const ohlcIndex = index + (supertrendAtrPeriod - 1); // Map result index back to original ohlcData index
      console.log(
        `Data point ${ohlcIndex +1} (Close: ${sampleOhlcData[ohlcIndex].close.toFixed(2)}): ${
          st.value !== null ? st.value.toFixed(2) : 'N/A'
        } | ${st.direction || 'N/A'}`
      );
    });
  } else {
    console.log("Could not calculate Manual Supertrend values for the example.");
  }

  // Calculate and display ADX
  console.log(`\nCalculating ADX for ${sampleOhlcData.length} data points with Period=${adxPeriod}:`);
  const adxValues = await calculateADX(sampleOhlcData, adxPeriod);

  if (adxValues && adxValues.length > 0) {
    console.log("\nCalculated ADX values (ADX | PDI | MDI):");
    // ADX results array from technicalindicators is same length as input,
    // with initial values having adx=0 or undefined, pdi/mdi undefined until enough data.
    // Valid ADX values start from index (2 * adxPeriod - 1) - 1 = 2*period-2 for the array if 0-indexed.
    // PDI/MDI values start from index (adxPeriod -1).
    adxValues.forEach((val, index) => {
      // The adxValues array starts from the first point where ADX is calculable.
      // This point corresponds to ohlcData index: (2 * adxPeriod - 2)
      const ohlcIndex = (2 * adxPeriod - 2) + index;
      if (val && val.pdi !== undefined && val.mdi !== undefined && val.adx !== undefined) {
         console.log(
          `Data point ${ohlcIndex + 1} (Close: ${sampleOhlcData[ohlcIndex].close.toFixed(2)}): ADX: ${val.adx.toFixed(2)}, PDI: ${val.pdi.toFixed(2)}, MDI: ${val.mdi.toFixed(2)}`
        );
      } else if (val && val.pdi !== undefined && val.mdi !== undefined ) { // ADX might be 0 or NaN if not fully smoothed
         console.log(
          `Data point ${ohlcIndex + 1} (Close: ${sampleOhlcData[ohlcIndex].close.toFixed(2)}): ADX: N/A, PDI: ${val.pdi.toFixed(2)}, MDI: ${val.mdi.toFixed(2)}`
        );
      }
      // To reduce noise, one might only start printing from index (adxPeriod -1)
    });
  } else {
    console.log("Could not calculate ADX values for the example.");
  }

  // Calculate and display MFI
  console.log(`\nCalculating MFI for ${sampleOhlcvData.length} data points with Period=${mfiPeriod}:`);
  const mfiValues = await calculateMFI(sampleOhlcvData, mfiPeriod);

  if (mfiValues && mfiValues.length > 0) {
    console.log("\nCalculated MFI values:");
    // MFI results array from technicalindicators is shorter.
    // It starts after `mfiPeriod` data points have been processed to form the first MFI value.
    // The first MFI value corresponds to ohlcvData index `mfiPeriod`.
    mfiValues.forEach((val, index) => {
      const ohlcvIndex = mfiPeriod + index; // Map MFI result index back to original ohlcvData index
      console.log(
        `Data point ${ohlcvIndex + 1} (Close: ${sampleOhlcvData[ohlcvIndex].close.toFixed(2)}, Vol: ${sampleOhlcvData[ohlcvIndex].volume.toFixed(0)}): MFI: ${val.toFixed(2)}`
      );
    });
  } else {
    console.log("Could not calculate MFI values for the example.");
  }
}

runExample();
