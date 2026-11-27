// What the stand-in models answer when the question has one of these words in it: answers as a real one writes them.
export const ANSWERS = {
  MARKDOWN: `The chapter makes **three** points, and one of them twice.

1. The fox is *quick*.
2. The dog is lazy: see [Chapter 2](#section-3).
3. Neither minds.

| Who | What |
| --- | --- |
| Fox | jumps |
| Dog | lets it |

In the book's words: \`the quick brown fox\`. More at [the publisher](https://example.com/book).

> A quoted line.`,
  DRAW: `Here is how the two stand to each other.

\`\`\`svg
<svg viewBox="0 0 600 220" width="900" height="330" xmlns="http://www.w3.org/2000/svg" onload="window.__pwned = 1">
  <script>window.__pwned = 2</script>
  <style>text { fill: red }</style>
  <rect x="40" y="60" width="200" height="100" rx="14" fill="#e8dcc0" stroke="currentColor" stroke-width="2" style="fill: red"/>
  <rect x="360" y="60" width="200" height="100" rx="14" fill="#cfe0d4" stroke="currentColor" stroke-width="2"/>
  <text x="140" y="116" text-anchor="middle" font-size="18" fill="currentColor">The fox</text>
  <text x="460" y="116" text-anchor="middle" font-size="18" fill="currentColor">The dog</text>
  <path d="M240 110 H360" stroke="currentColor" stroke-width="2" fill="none"/>
  <text x="300" y="98" text-anchor="middle" font-size="14" fill="currentColor">jumps over</text>
  <image href="https://example.com/x.png" x="0" y="0" width="10" height="10"/>
  <a href="https://example.com"><text x="300" y="200">a link</text></a>
</svg>
\`\`\`

The fox does all the work.`,
  UNSAFE: `Before <img src="x" onerror="window.__pwned = 3"> and <script>window.__pwned = 4</script> and [a bad link](javascript:window.__pwned=5) and <span style="color:red" class="tick" data-chat="close" onclick="window.__pwned = 6">a span</span> after. ![a picture](https://example.com/p.png)`,
};
export const scripted = (last) => Object.keys(ANSWERS).find((word) => last.includes(word));
