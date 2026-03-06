/*
 * CLI script to manually test src/utils/route-parser.js
 * Usage: node scripts/test-route-parser.js <url>
 */
import { RouteParser } from '../src/utils/route-parser.js';

async function main() {
    const url = process.argv[2];

    if (!url) {
        console.error('Error: Please provide a URL to test.');
        console.error('Usage: node scripts/test-route-parser.js <url>');
        process.exit(1);
    }

    console.log('='.repeat(50));
    console.log(` Testing route parser with URL:`);
    console.log(` ${url}`);
    console.log('='.repeat(50));

    const isKnown = RouteParser.isKnownProvider(url);
    console.log(`\nProvider Check:`);
    console.log(`- Is known provider : ${isKnown}`);

    if (isKnown) {
        const provider = RouteParser.getRouteProvider(url);
        console.log(`- Detected Provider : ${provider}`);
        console.log(`- Route ID          : ${RouteParser.getRouteId(url)}`);
    }

    console.log('\nParsing raw data (RouteParser.parseRoute)...');
    try {
        const parseResult = await RouteParser.parseRoute(url);
        if (!parseResult) {
            console.log('Result: null (Failed to parse or unsupported)');
        } else {
            console.log('Result:');
            console.dir(parseResult, { depth: null, colors: true });
        }
    } catch (err) {
        console.error('Error during parseRoute:', err.message);
    }

    console.log('\nProcessing info (RouteParser.processRouteInfo)...');
    try {
        const processResult = await RouteParser.processRouteInfo(url);
        console.log('Result:');
        console.dir(processResult, { depth: null, colors: true });
    } catch (err) {
        console.error('Error during processRouteInfo:', err.message);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
