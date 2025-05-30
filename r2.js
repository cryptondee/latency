/**
 * RPC Latency Tester
 * Tests multiple RPC URLs sequentially for 10 seconds each and reports average latency
 */

const { ethers } = require("ethers");

// RPC URLs to test
const rpcUrls = [
  "https://carrot.megaeth.com/rpc", // MegaETH RPC
  "https://testnet-rpc.monad.xyz", // Monad RPC
];

// Test duration in milliseconds (10 seconds)
const TEST_DURATION = 10000;

// Connection timeout in milliseconds (5 seconds)
const CONNECTION_TIMEOUT = 5000;

// Store results for final report
const results = [];

/**
 * Test a single RPC URL for the specified duration
 * @param {string} rpcUrl The RPC URL to test
 */
async function testRpcUrl(rpcUrl) {
  console.log(`\nStarting test for ${rpcUrl}...`);

  let totalLatency = 0;
  let requestCount = 0;
  let minLatency = Infinity;
  let maxLatency = 0;
  const latencies = [];

  try {
    // Create provider with a timeout option
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      timeout: CONNECTION_TIMEOUT,
    });

    // Test connection first with a timeout
    console.log("Testing initial connection...");
    try {
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Connection timeout")),
            CONNECTION_TIMEOUT
          )
        ),
      ]);
      console.log("✅ Connection successful, beginning tests");
    } catch (connErr) {
      throw new Error(`Initial connection failed: ${connErr.message}`);
    }

    const startTime = Date.now();

    // First request (often has higher latency due to connection setup)
    const perfNow =
      typeof performance !== "undefined"
        ? () => performance.now()
        : () => Date.now();

    const firstStart = perfNow();
    await provider.getBlock("latest"); // Use getBlock instead of getBlockNumber
    const firstLatency = perfNow() - firstStart;

    // Detect suspicious 0ms readings
    if (firstLatency === 0) {
      console.log(
        `First request (warmup): ${firstLatency} ms (suspicious 0ms reading)`
      );
    } else {
      console.log(`First request (warmup): ${firstLatency} ms`);
    }

    // Continue testing until duration is reached
    while (Date.now() - startTime < TEST_DURATION) {
      try {
        // Use performance.now() for more precise timing if available
        const perfNow =
          typeof performance !== "undefined"
            ? () => performance.now()
            : () => Date.now();

        const start = perfNow();
        // Use a more substantial request to reduce caching
        await provider.getBlock("latest");
        const latency = perfNow() - start;

        // Skip suspicious 0ms readings - they're measurement anomalies
        if (latency === 0) {
          console.log(
            `Request ${
              requestCount + 1
            }: ${latency} ms (suspicious 0ms reading, ignoring)`
          );
        } else {
          totalLatency += latency;
          requestCount++;
          minLatency = Math.min(minLatency, latency);
          maxLatency = Math.max(maxLatency, latency);
          latencies.push(latency);

          console.log(`Request ${requestCount}: ${latency} ms`);
        }

        // Small delay between requests to avoid overwhelming the RPC endpoint
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (requestErr) {
        console.warn(`Request error: ${requestErr.message}`);
        // Continue with next request despite error
      }
    }

    // Calculate statistics if we have valid requests
    if (requestCount > 0) {
      const avgLatency = totalLatency / requestCount;

      // Calculate median latency
      latencies.sort((a, b) => a - b);
      const medianLatency =
        latencies.length % 2 === 0
          ? (latencies[latencies.length / 2 - 1] +
              latencies[latencies.length / 2]) /
            2
          : latencies[Math.floor(latencies.length / 2)];

      // Store results
      results.push({
        rpcUrl,
        requestCount,
        avgLatency,
        minLatency,
        maxLatency,
        medianLatency,
      });

      console.log(`\nResults for ${rpcUrl}:`);
      console.log(`  Requests: ${requestCount}`);
      console.log(`  Average Latency: ${avgLatency.toFixed(2)} ms`);
      console.log(`  Median Latency: ${medianLatency.toFixed(2)} ms`);
      console.log(`  Min Latency: ${minLatency} ms`);
      console.log(`  Max Latency: ${maxLatency} ms`);
    } else {
      throw new Error("No successful requests completed");
    }
  } catch (error) {
    // More detailed error handling
    let errorMessage = error.message;

    // Handle specific error cases
    if (error.code === "ENOTFOUND") {
      errorMessage = `Could not resolve hostname: ${
        error.hostname || "unknown host"
      }`;
    } else if (error.message.includes("certificate")) {
      errorMessage = "SSL/TLS certificate validation failed";
    } else if (error.message.includes("timeout")) {
      errorMessage = "Connection timed out";
    } else if (error.message.includes("cannot start up")) {
      errorMessage = "Failed to connect to RPC endpoint";
    }

    console.error(`❌ Error testing ${rpcUrl}: ${errorMessage}`);
    results.push({
      rpcUrl,
      error: errorMessage,
    });
  }
}

/**
 * Test all RPC URLs sequentially
 */
async function runTests() {
  console.log("🚀 Starting RPC Latency Tests");
  console.log(
    `Each RPC endpoint will be tested for ${TEST_DURATION / 1000} seconds`
  );
  console.log(`Connection timeout set to ${CONNECTION_TIMEOUT / 1000} seconds`);

  for (const rpcUrl of rpcUrls) {
    await testRpcUrl(rpcUrl);
  }

  // Print final summary report
  console.log("\n======= 📊 FINAL RESULTS =======");
  console.log("RPC Endpoint Latency Comparison:");

  // Sort results by average latency (successful tests only)
  const successfulResults = results
    .filter((r) => !r.error)
    .sort((a, b) => a.avgLatency - b.avgLatency);
  const failedResults = results.filter((r) => r.error);

  if (successfulResults.length > 0) {
    // Display table header
    console.log("\n✅ Successful Tests (sorted by average latency):");
    console.log(
      "--------------------------------------------------------------------"
    );
    console.log(
      "| RPC URL                          | Avg (ms) | Median | Min | Max |"
    );
    console.log(
      "--------------------------------------------------------------------"
    );

    // Display successful results
    successfulResults.forEach((result) => {
      const url = result.rpcUrl.padEnd(32).substring(0, 32);
      console.log(
        `| ${url} | ${result.avgLatency
          .toFixed(2)
          .padStart(7)} | ${result.medianLatency
          .toFixed(2)
          .padStart(6)} | ${result.minLatency
          .toString()
          .padStart(3)} | ${result.maxLatency.toString().padStart(3)} |`
      );
    });
    console.log(
      "--------------------------------------------------------------------"
    );
  } else {
    console.log("\n⚠️ No successful tests completed");
  }

  // Display failed tests if any
  if (failedResults.length > 0) {
    console.log("\n❌ Failed Tests:");
    failedResults.forEach((result) => {
      console.log(`${result.rpcUrl} - Error: ${result.error}`);
    });
  }
}

// Start the tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
