import fs from 'fs';

const outPath = 'C:\\Users\\sarth\\.gemini\\antigravity-cli\\brain\\d7f7fe14-b35e-4541-b073-f1054e356cae\\scratch\\youtube-search.json';
const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));

try {
  const contents = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
  if (contents) {
    // Let's find Section 9 which had Title: "All Too Well" and renderer: musicResponsiveListItemRenderer
    const item = contents[9].itemSectionRenderer.contents[0];
    console.log(JSON.stringify(item, null, 2));
  }
} catch (e: any) {
  console.error('Err:', e.message);
}
