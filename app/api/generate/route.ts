import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

// OPENAI_API_KEY is read automatically from the environment by createOpenAI().
const alibaba = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'qwen-max';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { topic, objectives, specialInstructions, includeChallenge, questionCount,
            include3DGraph, includeSolver, includeFlashcards,
            sourceText, sourceTitle, sourceUrl } =
      await req.json();

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const hasSource = !!(sourceText && typeof sourceText === 'string' && sourceText.trim());

    const sourceClause = hasSource
      ? [
          '',
          '=== USER-PROVIDED REFERENCE SOURCE - PRIMARY SOURCE MATERIAL (CRITICAL) ===',
          'Source: ' + (sourceTitle || 'Untitled') + (sourceUrl ? ' (' + sourceUrl + ')' : ''),
          'The user has supplied the following reference material. It is your MAIN source for this lesson:',
          '- Base the lesson structure, definitions, theorems, notation, examples, and terminology on this source. Follow its scope, depth, and ordering of ideas.',
          '- NEVER contradict, dilute, or skip past the source content: every definition and theorem you state must be consistent with it.',
          '- You MAY enrich the source with standard supporting math (background, extra examples, applications) when it serves the lesson, but the source content takes priority wherever they differ.',
          '- Do NOT mention the source, its title, its author, or that reference material was used anywhere in the artifact. Present the material as original lesson content.',
          '- Preserve the source\'s notation and conventions (variable names, units, theorem style) unless they are clearly erroneous.',
          '',
          '--- BEGIN REFERENCE SOURCE ---',
          String(sourceText).slice(0, 120000),
          '--- END REFERENCE SOURCE ---',
        ].join(String.fromCharCode(10))
      : '';

    const objectivesClause = objectives && String(objectives).trim()
      ? [
          '',
          'Lesson Objectives (AUTHORED BY THE USER - treat these as the authoritative contract for what the lesson must teach; cover every one of them explicitly and measurably in Section 2):',
          String(objectives).trim(),
        ].join(String.fromCharCode(10))
      : [
          '',
          'Lesson Objectives: NOT PROVIDED. Author 6-8 professional, measurable, college-level learning objectives yourself (Bloom verbs, specific to the topic, sequenced from foundational to advanced), and present them in Section 2 as if they were the official course objectives.',
        ].join(String.fromCharCode(10));

    const challengeClause =
      includeChallenge && questionCount > 0
        ? `\n\nSection 12 - Mastery Challenge Quiz: Include a comprehensive interactive quiz with EXACTLY ${questionCount} multiple-choice questions. CRITICAL REQUIREMENTS FOR SECTION 12: (1) ALL questions and all 4 options (A-D) MUST be written DIRECTLY IN THE HTML of Section 12 (do NOT generate questions from JavaScript string arrays, which ruins LaTeX math escapes like \\neq and \\pm). (2) Every option MUST be an individual full-width clickable <button type="button" class="quiz-opt ..."> element so options are never crammed onto one line. (3) MathJax automatically renders all LaTeX math in the HTML on page load. (4) Use JavaScript event listeners on .quiz-opt to reveal instant green (correct) / red (incorrect) feedback, show an explanation card, and update a live score tracker ("Score: X / ${questionCount}").`
        : '';

    const systemPrompt = [
      'You are a world-class educational web developer and college mathematics professor. Generate a SINGLE, SELF-CONTAINED, COMPREHENSIVE HTML lesson artifact.',
      '',
      '=== CRITICAL RULES - FOLLOW EVERY ONE WITHOUT EXCEPTION ===',
      '',
      'RULE 1 - COMPREHENSIVE CONTENT:',
      'Write at least 3,500-5,000 words of instructional content. Every theory section must have multiple detailed paragraphs explaining both the intuition and the formalism. Do NOT use filler text, summaries, or placeholder content anywhere.',
      '',
      'RULE 2 - WORKING PLOTLY.JS GRAPHS AND SLIDERS (CRITICAL - FOLLOW EXACT PATTERN):',
      '* Load Plotly.js in <head>: <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>',
      '* Include EXACTLY 2 interactive Plotly.js graphs in Section 7.',
      '* Every graph MUST have a working slider control that updates the graph in REAL TIME.',
      '* WHY SLIDERS COMMONLY BREAK & HOW TO PREVENT IT:',
      '  - If functions are inside DOMContentLoaded, inline HTML oninput="updateGraph1(this.value)" CANNOT access them (throws ReferenceError: updateGraph1 is not defined)!',
      '  - To guarantee sliders work, do BOTH: (1) wire slider.addEventListener("input", function() { ... }) in JS, AND (2) expose window.updateGraph1 = updateGraph1;',
      '  - Store the Plotly layout object in a variable outside the update function so Plotly.react can reuse it.',
      '  - Display the current slider value in a <span id="sliderVal1">...</span> and update it on input.',
      '  - Call updateGraph1(initialVal) on page load so the graph renders immediately without requiring user interaction.',
      '* EXACT WORKING PATTERN TO WRITE IN THE HTML & JAVASCRIPT:',
      '  HTML:',
      '    <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm my-4">',
      '      <div class="flex items-center gap-4 mb-3">',
      '        <label for="slider1" class="font-semibold text-gray-700">Parameter a = <span id="sliderVal1" class="text-orange-600 font-bold">1.0</span></label>',
      '        <input type="range" id="slider1" min="-5" max="5" step="0.1" value="1.0" class="w-64 accent-orange-500 cursor-pointer">',
      '      </div>',
      '      <div id="graph1" style="width:100%; height:420px;"></div>',
      '    </div>',
      '  JAVASCRIPT (inside DOMContentLoaded):',
      '    var layout1 = {',
      '      title: { text: "Interactive Exploration", font: { family: "Inter, sans-serif", size: 16 } },',
      '      xaxis: { title: "x", gridcolor: "#f3f4f6", zerolinecolor: "#9ca3af" },',
      '      yaxis: { title: "y", gridcolor: "#f3f4f6", zerolinecolor: "#9ca3af" },',
      '      paper_bgcolor: "#ffffff", plot_bgcolor: "#f9fafb", showlegend: true',
      '    };',
      '    function updateGraph1(param) {',
      '      var xVals = [], yVals = [];',
      '      for (var i = -10; i <= 10; i += 0.1) {',
      '        var x = parseFloat(i.toFixed(2));',
      '        xVals.push(x);',
      '        yVals.push(param * x * x); /* replace with topic function */',
      '      }',
      '      Plotly.react("graph1", [{ x: xVals, y: yVals, type: "scatter", mode: "lines", line: { color: "#f97316", width: 2.5 }, name: "f(x)" }], layout1);',
      '    }',
      '    var slider1 = document.getElementById("slider1");',
      '    var sliderVal1 = document.getElementById("sliderVal1");',
      '    if (slider1) {',
      '      slider1.addEventListener("input", function() {',
      '        var val = parseFloat(this.value);',
      '        if (sliderVal1) sliderVal1.textContent = val.toFixed(1);',
      '        updateGraph1(val);',
      '      });',
      '    }',
      '    window.updateGraph1 = updateGraph1;',
      '    updateGraph1(1.0); /* initial render */',
      '',
      'RULE 3 - WORKING INTERACTIVE PRACTICE CALCULATOR (CRITICAL - TEXT INPUTS FOR FUNCTIONS):',
      '* In Section 8, build a fully functional step-by-step calculator for the topic.',
      '* CRITICAL INPUT TYPE RULE:',
      '  - For ANY function expression, equation, or formula: ALWAYS USE <input type="text"> -- NEVER <input type="number">!',
      '  - <input type="number"> displays up/down spinner arrows (^v) and STRICTLY BLOCKS users from typing letters like "x", "+", "^", "sin"! This breaks the app completely!',
      '  - For purely numeric evaluation points (e.g., evaluate at x = 3): use <input type="number" step="any">.',
      '* ALWAYS PRE-FILL DEFAULT VALUES so the calculator works immediately upon clicking Calculate:',
      '  - Example: <input type="text" id="calcFuncF" value="2*x + 3" placeholder="e.g. 2*x + 3">',
      '  - Example: <input type="text" id="calcFuncG" value="x^2 - 1" placeholder="e.g. x^2 - 1">',
      '  - Example: <input type="number" id="calcValX" value="3" step="any">',
      '* INCLUDE A ROBUST EXPRESSION EVALUATOR IN JAVASCRIPT:',
      '  function evalMathExpr(exprStr, xVal) {',
      '    try {',
      '      var clean = exprStr.trim().replace(/^[a-zA-Z]\\s*\\([a-zA-Z]\\)\\s*=\\s*/, "");',
      '      clean = clean.split("^").join("**");',
      '      clean = clean.replace(/([0-9])\\s*([a-zA-Z(])/g, "$1*$2");',
      '      clean = clean.replace(/(\\))\\s*([a-zA-Z0-9(])/g, "$1*$2");',
      '      clean = clean.replace(/\\bsin\\b/gi, "Math.sin").replace(/\\bcos\\b/gi, "Math.cos").replace(/\\btan\\b/gi, "Math.tan");',
      '      clean = clean.replace(/\\bsqrt\\b/gi, "Math.sqrt").replace(/\\babs\\b/gi, "Math.abs").replace(/\\bpi\\b/gi, "Math.PI");',
      '      var fn = new Function("x", "return " + clean + ";");',
      '      var res = fn(xVal);',
      '      return isNaN(res) ? null : res;',
      '    } catch (e) { return null; }',
      '  }',
      '* CALCULATOR WORKFLOW:',
      '  1. User enters function expressions in <input type="text"> and evaluation point in <input type="number">',
      '  2. User selects operation (or calculate button computes all relevant operations)',
      '  3. Clicking Calculate reads values, evaluates them step-by-step, and builds detailed HTML with MathJax \\( ... \\) and \\[ ... \\]',
      '  4. Renders output into <div id="calcResults"></div>',
      '  5. ALWAYS calls: if (window.MathJax) { MathJax.typesetPromise([document.getElementById("calcResults")]); }',
      '  6. Attach with btn.addEventListener("click", calculateResults); AND call calculateResults() once on load so results are visible immediately.',
      '',
      'RULE 4 - NO PLACEHOLDERS ANYWHERE:',
      'NEVER write "Graph Placeholder", "Chart will appear here", "Coming soon", or any placeholder text. Every interactive element must be fully functional.',
      '',
      'RULE 5 - MODERN CLEAN UI WITH A PREMIUM HERO HEADER (CRITICAL):',
      '* Load Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>',
      '* Import fonts: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">',
      '* Page background: white (#ffffff). Section cards: white bg, 1px #e5e7eb border, soft box-shadow, 16px border-radius.',
      '* Primary accent: warm orange (#f97316). Secondary: deep slate.',
      '* Worked Example cards: amber-tinted (#fff7ed) with 4px orange left border.',
      '* Theorem boxes: purple-tinted (#eef2ff) with 4px purple left border.',
      '* Pitfall boxes: red-tinted (#fef2f2) with 4px red left border.',
      '* Application boxes: green-tinted (#f0fdf4) with 4px green left border.',
      '* Layout: max-w-5xl centered. Fully mobile-responsive.',
      '',
      '* SECTION 1 HERO HEADER - build a premium gradient banner EXACTLY like this:',
      '  <header class="relative overflow-hidden rounded-3xl mb-8" style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #7c2d12 100%);">',
      '    <div class="absolute inset-0" style="background: radial-gradient(circle at 85% 20%, rgba(249,115,22,0.35), transparent 45%), radial-gradient(circle at 10% 90%, rgba(129,140,248,0.25), transparent 50%);"></div>',
      '    <div class="absolute -top-10 -right-10 w-64 h-64 rounded-full border border-white/10"></div>',
      '    <div class="absolute -bottom-16 -left-8 w-72 h-72 rounded-full border border-white/10"></div>',
      '    <div class="relative px-8 py-12 md:px-12 md:py-16">',
      '      <div class="flex items-center gap-2 mb-5">',
      '        <span class="px-3 py-1 rounded-full text-xs font-semibold text-white/90 border border-white/20 bg-white/10">College Mathematics</span>',
      '        <span class="px-3 py-1 rounded-full text-xs font-semibold text-white/90 border border-white/20 bg-white/10">Difficulty badge here</span>',
      '      </div>',
      '      <h1 class="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight mb-4">Topic Title Here</h1>',
      '      <p class="text-lg text-white/80 max-w-3xl leading-relaxed mb-6">Overview paragraph 1...</p>',
      '      <p class="text-white/70 max-w-3xl leading-relaxed">Overview paragraph 2...</p>',
      '      <div class="flex flex-wrap gap-6 mt-8 pt-6 border-t border-white/15">',
      '        <div><p class="text-2xl font-bold text-orange-300">X</p><p class="text-xs text-white/60">Objectives</p></div>',
      '        <div><p class="text-2xl font-bold text-orange-300">X</p><p class="text-xs text-white/60">Worked Examples</p></div>',
      '-counts matched to this lesson',
      '      </div>',
      '    </div>',
      '  </header>',
      '* The hero MUST span the full content width, with the rounded-3xl gradient style above - never a plain h1 on white.',
      '* EVERY section heading (h2) uses this pattern: <div class="flex items-center gap-3 mb-6"><div class="w-1 h-8 rounded-full" style="background: linear-gradient(180deg, #f97316, #7c2d12);"></div><h2 class="text-2xl font-bold text-slate-900">...</h2></div> - never a bare h2.',
      '',
      'RULE 6 - MATH NOTATION WITH MATHJAX (CRITICAL - READ EVERY WORD):',
      '* Add this EXACT MathJax config AFTER Plotly CDN in <head>:',
      '  <script>window.MathJax = { tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]], processEscapes: true } };</script>',
      '  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>',
      '',
      '* USE BACKSLASH-PAREN DELIMITERS for all math:',
      '  - Inline math: \( f(x) \)  -- backslash-paren OPEN, content, backslash-paren CLOSE',
      '  - Display math: \[ f(x) = x^2 \]  -- backslash-bracket OPEN, content, backslash-bracket CLOSE',
      '',
      '* CORRECT EXAMPLES — write EXACTLY like this in the HTML:',
      '  Inline: The function \\( f(x) = x^2 \\) is a parabola.',
      '  Inline: We evaluate at \\( x = 3 \\) to get \\( f(3) = 9 \\).',
      '  Inline: The domain is \\( D_f \\cap D_g \\) where \\( g(x) \\neq 0 \\).',
      '  Display: \\[ \\int_a^b f(x)\\,dx = F(b) - F(a) \\]',
      '  Display: \\[ \\frac{d}{dx}\\left[u \\cdot v\\right] = u^{\\prime}v + uv^{\\prime} \\]',
      '  Quiz option: \\( x \\geq 0 \\) -- EVERY math expression in quiz MUST use \\( \\)',
      '  Quiz option: \\( \\frac{f}{g}(x) \\) -- wrap ALL answer choices in \\( \\)',
      '',
      '* WRONG - NEVER DO THESE:',
      '  WRONG: \f(x) -- backslash directly before letter without paren is wrong',
      '  WRONG: \(f(x \) -- the content leaks out of the delimiter',
      '  WRONG: unclosed delimiters -- always match every \( with \)',
      '  WRONG: raw < or > inside math -- use \leq \geq \lt \gt instead',
      '',
      '* LATEX SYNTAX RULES TO PREVENT ERRORS:',
      '  - ALWAYS pair \left( with \right) -- never use one without the other',
      '  - ALWAYS pair \left[ with \right]',
      '  - ALWAYS pair \left\{ with \right\}',
      '  - Fractions: \frac{numerator}{denominator}',
      '  - Square roots: \sqrt{x} or \sqrt[n]{x}',
      '  - Intersection: \cap    Union: \cup    Not-equal: \neq',
      '  - Always close ALL { braces before closing the math delimiter',
      '  - Multi-char subscripts/superscripts need braces: x_{n+1} not x_n+1',
      '',
      'RULE 7 - REQUIRED SECTIONS (ALL MUST BE PRESENT AND DETAILED):',
      '  Section 1:  Hero/Title - large banner, topic name, subtitle, difficulty badge, 2-paragraph overview',
      '  Section 2:  Learning Objectives - 6+ specific objectives with orange checkmark icons',
      '  Section 3:  Prerequisites/Quick Review - prerequisite topics with LaTeX formulas',
      '  Section 4:  In-Depth Theory and Definitions - MINIMUM 4 long paragraphs with LaTeX equations',
      '  Section 5:  Key Theorems and Properties - 3+ formally stated theorems with LaTeX and derivations',
      '  Section 6:  Worked Examples - MINIMUM 4 examples each fully solved step-by-step in LaTeX',
      '  Section 7:  Interactive Graph Explorer - 2 working Plotly.js graphs with real-time controls',
      '  Section 8:  Interactive Practice Calculator - working JS calculator per Rule 3',
      '  Section 9:  Common Mistakes and Pitfalls - 5+ items in red boxes with WRONG/CORRECT format',
      '  Section 10: Real-World Applications - 3+ detailed examples in green cards',
      '  Section 11: Summary and Key Takeaways - comprehensive recap with formula reference table',
      '',
      'RULE 8 - OUTPUT AND CODE QUALITY:',
      '* Output ONLY raw HTML starting with <!DOCTYPE html>. No markdown, no code fences.',
      '* OUTPUT ORDER AND BUDGET (CRITICAL): Write the complete <script> block with ALL custom JavaScript (graphs, sliders, calculator, quiz) as the LAST element before </body>. Do NOT write </body> or </html> until that script block is fully written. Budget your prose so the JavaScript always fits: if you are running long, shorten explanations but NEVER drop the script block.',
      '* File MUST be at least 400 lines.',
      '* All JavaScript must be syntactically correct.',
      '* Script load order in <head>: (1) Google Fonts, (2) Tailwind CDN, (3) Plotly CDN, (4) MathJax config, (5) MathJax CDN.',
      '* ALL custom JavaScript in ONE <script> block at very bottom of <body>, wrapped in DOMContentLoaded.',
      '',
      'RULE 9 - MASTERY CHALLENGE QUIZ (CRITICAL - WRITE IN HTML, NEVER JS STRINGS):',
      '* WHY QUIZ MATH BREAKS IN JAVASCRIPT STRINGS:',
      '  - If quiz questions/options are defined in JavaScript strings like `q: "What is ( x \\neq 1 )"`, the JS engine strips escapes: \\neq becomes newline + "eq" (rendering as "x eq 1"), \\pm becomes "pm", and delimiters get stripped!',
      '  - Furthermore, dynamically concatenating options in JS causes all 4 choices to be crammed onto one line without button styling!',
      '* THE REQUIRED FIX - WRITE ALL QUIZ QUESTIONS AND OPTIONS DIRECTLY IN HTML:',
      '  In Section 12, write all quiz questions and options directly in the HTML markup. MathJax automatically discovers and renders all math on initial page load without any escaping bugs or timing delays.',
      '* EXACT HTML STRUCTURE TO WRITE IN SECTION 12:',
      '  <div class="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm my-8">',
      '    <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">',
      '      <h2 class="text-2xl font-bold text-gray-900">Mastery Challenge Quiz</h2>',
      '      <div class="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-1.5 rounded-xl font-semibold text-sm">',
      '        Score: <span id="quizScore">0</span> / <span id="quizTotal">5</span>',
      '      </div>',
      '    </div>',
      '    <!-- Question Card -->',
      '    <div class="quiz-item mb-6 p-5 bg-gray-50 border border-gray-200 rounded-xl" data-answered="false">',
      '      <p class="font-semibold text-gray-800 mb-3 text-base">',
      '        <span class="inline-block bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">Q1</span>',
      '        What is the domain of \\( \\left(\\frac{f}{g}\\right)(x) = \\frac{2x + 3}{x^2 - 1} \\)?',
      '      </p>',
      '      <div class="space-y-2.5">',
      '        <button type="button" class="quiz-opt w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-orange-50 hover:border-orange-300 transition text-sm text-gray-800 flex justify-between items-center" data-correct="false">',
      '          <span><strong>A.</strong> All real numbers</span><span class="opt-icon text-base"></span>',
      '        </button>',
      '        <button type="button" class="quiz-opt w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-orange-50 hover:border-orange-300 transition text-sm text-gray-800 flex justify-between items-center" data-correct="false">',
      '          <span><strong>B.</strong> \\( \\{ x \\in \\mathbb{R} \\mid x \\neq 1 \\} \\)</span><span class="opt-icon text-base"></span>',
      '        </button>',
      '        <button type="button" class="quiz-opt w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-orange-50 hover:border-orange-300 transition text-sm text-gray-800 flex justify-between items-center" data-correct="false">',
      '          <span><strong>C.</strong> \\( \\{ x \\in \\mathbb{R} \\mid x \\neq -1 \\} \\)</span><span class="opt-icon text-base"></span>',
      '        </button>',
      '        <button type="button" class="quiz-opt w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-orange-50 hover:border-orange-300 transition text-sm text-gray-800 flex justify-between items-center" data-correct="true">',
      '          <span><strong>D.</strong> \\( \\{ x \\in \\mathbb{R} \\mid x \\neq \\pm 1 \\} \\)</span><span class="opt-icon text-base"></span>',
      '        </button>',
      '      </div>',
      '      <div class="quiz-feedback hidden mt-3 p-3 rounded-xl text-sm border"></div>',
      '    </div>',
      '  </div>',
      '* EXACT JAVASCRIPT FOR QUIZ (inside DOMContentLoaded at bottom of <body>):',
      '  var quizScore = 0;',
      '  var quizItems = document.querySelectorAll(".quiz-item");',
      '  var scoreEl = document.getElementById("quizScore");',
      '  var totalEl = document.getElementById("quizTotal");',
      '  if (totalEl) totalEl.textContent = quizItems.length;',
      '  quizItems.forEach(function(item) {',
      '    var options = item.querySelectorAll(".quiz-opt");',
      '    var feedback = item.querySelector(".quiz-feedback");',
      '    options.forEach(function(btn) {',
      '      btn.addEventListener("click", function() {',
      '        if (item.getAttribute("data-answered") === "true") return;',
      '        item.setAttribute("data-answered", "true");',
      '        var isCorrect = this.getAttribute("data-correct") === "true";',
      '        options.forEach(function(opt) {',
      '          opt.disabled = true;',
      '          opt.classList.remove("hover:bg-orange-50", "hover:border-orange-300");',
      '          if (opt.getAttribute("data-correct") === "true") {',
      '            opt.classList.add("bg-green-50", "border-green-500", "text-green-800", "font-semibold");',
      '            opt.querySelector(".opt-icon").innerHTML = "✓";',
      '          }',
      '        });',
      '        if (!isCorrect) {',
      '          this.classList.add("bg-red-50", "border-red-500", "text-red-800");',
      '          this.querySelector(".opt-icon").innerHTML = "✗";',
      '        } else {',
      '          quizScore++;',
      '          if (scoreEl) scoreEl.textContent = quizScore;',
      '        }',
      '        if (feedback) {',
      '          feedback.classList.remove("hidden");',
      '          feedback.className = "quiz-feedback mt-3 p-3 rounded-xl text-sm border " + (isCorrect ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200");',
      '          feedback.innerHTML = isCorrect ? "<strong>Correct!</strong> Well done." : "<strong>Incorrect.</strong> Check where the denominator equals zero.";',
      '          if (window.MathJax) { MathJax.typesetPromise([feedback]); }',
      '        }',
      '      });',
      '    });',
      '  });',
      '',
      '=== END OF CRITICAL RULES ==='
    ].join('\n');

    const userPrompt = [
      `Generate a COMPREHENSIVE, DETAILED, INTERACTIVE college-level mathematics lesson on: "${topic.trim()}".`,
      '',
      '=== REFERENCE SOURCE INTEGRATION ===',
      hasSource
        ? 'A user-provided reference source is attached at the end of this prompt. It is your PRIMARY source material: ground the lesson in it, follow its scope and notation, never contradict it, and never mention it explicitly in the artifact.'
        : 'No reference source was provided: author authoritative, self-contained college-level math content from your own expertise.',
      objectivesClause,
      sourceClause,
      '',
      'Special Instructions:',
      specialInstructions || 'None',
      '',
      'FINAL CHECKLIST - VERIFY EACH ITEM BEFORE OUTPUTTING:',
      '[1] MINIMUM 4 fully worked examples with every step in LaTeX using \\( \\) and \\[ \\]',
      '[2] EXACTLY 2 working Plotly.js graphs with functional sliders: wire slider.addEventListener("input", ...) AND set window.updateGraph = updateGraph; call initial updateGraph() on load',
      '[3] Working JS calculator: function expressions MUST use <input type="text"> (NEVER type="number" which blocks letters), pre-filled default values, working JS expression evaluation with step-by-step MathJax output and typesetPromise call',
      '[4] Theory section has 4+ detailed paragraphs',
      '[5] ALL math uses \\( \\) for inline and \\[ \\] for display everywhere - in theory, examples, quiz questions AND quiz answers',
      '[5b] Section 12 Mastery Challenge Quiz: Write all questions and options DIRECTLY IN HTML (not JS arrays) with styled full-width buttons (A-D) so MathJax renders LaTeX automatically and math is never corrupted',
      '[6] Premium gradient hero header (deep indigo-to-burnt-orange, rounded-3xl, badges, stat row) and every h2 with the orange gradient bar pattern',
      '[7] ALL custom scripts at bottom of <body> wrapped in DOMContentLoaded',
      '[8] Minimum 400 lines of HTML',
      challengeClause
    ].filter(s => s !== undefined).join('\n');

    const addonClauses = [
      include3DGraph
        ? `\n\nSection 13 - 3D Surface Explorer: Add an interactive 3D Plotly surface plot relevant to the topic (use data: [{ type: "surface", z: <2D array>, colorscale: "Oranges" }]) with 2 range sliders that recompute the z-matrix in real time via Plotly.react, following the same working-pattern rules as Rule 2 (window-exposed update function, initial render on load, live slider value display).`
        : '',
      includeSolver
        ? `\n\nSection 14 - Step-by-Step Solver: Add a guided solver panel: the user enters values in text/number inputs (Rule 3 input rules apply), clicks Solve, and JavaScript walks through the solution ONE STEP AT A TIME, revealing each step as a numbered card with LaTeX math (call MathJax.typesetPromise after each reveal), ending with a final answer card. Include a Restart button.`
        : '',
      includeFlashcards
        ? `\n\nSection 15 - Flashcard Review: Add 8+ flip flashcards written DIRECTLY IN HTML (no JS string arrays): each card is a .flashcard element with a front (question or term, may use \\( \\) math) and a back (answer/explanation). A small script toggles a .flipped class on click with a CSS 3D rotateY transition, plus Next/Previous buttons and a card counter.`
        : '',
    ].filter(Boolean).join('');

    const finalUserPrompt = userPrompt + addonClauses;

    const result = await streamText({
      model: alibaba(MODEL),
      system: systemPrompt,
      prompt: finalUserPrompt,
      temperature: 0.7,
      maxTokens: 8192,
    });

    // Stream the response, and if the model hit the output cap before closing
    // the document, automatically request continuation(s) and append them to
    // the same stream. After the document completes, verify that the
    // interactive script block (Plotly graphs / calculator / quiz) actually
    // exists; if the model finished the HTML without its JavaScript, request
    // ONLY the missing script and splice it in before </body> transparently.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let accumulated = '';
        const MAX_CONTINUATIONS = 2;
        // Hold back the document tail while streaming so that, on completion,
        // a repaired script block can still be inserted before </body>.
        const HOLD = 64;
        const emit = (text: string) => {
          if (text.length > 0) controller.enqueue(encoder.encode(text));
        };
        const docHasGraphDiv = (s: string) => /id=["']graph[12]["']/.test(s);
        const docHasGraphJS = (s: string) => /Plotly\.(react|newPlot)/.test(s);
        const docHasCalcDiv = (s: string) => /id=["']calcResults["']/.test(s);
        const docHasCalcJS = (s: string) => /function\s+evalMathExpr/.test(s);
        const docHasQuizDiv = (s: string) => /class=["'][^"']*quiz-item/.test(s);
        const docHasQuizJS = (s: string) => /querySelectorAll\(["']\.quiz-item/.test(s);

        try {
          let current = result;
          let leadingFenceStripped = false;
          let emitted = 0; // chars of the CLEAN doc already sent to the client
          let finished = false;
          for (let i = 0; i <= MAX_CONTINUATIONS && !finished; i++) {
            for await (const delta of current.textStream) {
              accumulated += delta;
              // Strip a leading ```html fence the model may prepend.
              if (!leadingFenceStripped) {
                const m = accumulated.match(/^```(?:html|HTML)?\s*\r?\n?/);
                if (m && (m[0].includes('\n') || accumulated.length > m[0].length + 200)) {
                  accumulated = accumulated.slice(m[0].length);
                  leadingFenceStripped = true;
                } else if (!/^`{1,3}/.test(accumulated) && accumulated.length >= 15) {
                  leadingFenceStripped = true; // confirmed: no leading fence
                }
              }
              if (!leadingFenceStripped) continue; // buffer until fence known
              // As soon as the closing </html> tag appears, the document is
              // complete: trim anything the model appended after it.
              const lowerNow = accumulated.toLowerCase();
              const endIdx = lowerNow.indexOf('</html>');
              if (endIdx !== -1) {
                accumulated = accumulated.slice(0, endIdx + '</html>'.length);
                finished = true;
                break;
              }
              // Emit only up to the hold-back tail (keeps room for a repair).
              const safeLen = Math.max(0, accumulated.length - HOLD);
              if (safeLen > emitted) {
                emit(accumulated.slice(emitted, safeLen));
                emitted = safeLen;
              }
            }
            if (finished) break;
            const trimmed = accumulated.trimEnd();
            if (/<\/html>\s*$/i.test(trimmed)) { finished = true; break; }
            if (i === MAX_CONTINUATIONS) break; // give up, client will warn
            // Truncated: ask the model to continue exactly where it stopped.
            current = await streamText({
              model: alibaba(MODEL),
              system: systemPrompt,
              prompt:
                `You were generating an HTML lesson but your output was cut off. ` +
                `Here is the last 500 characters of what you produced:\n\n` +
                `...${accumulated.slice(-500)}\n\n` +
                `Continue EXACTLY from that point. Do NOT repeat any content you already wrote. ` +
                `Do NOT restart the document. Output ONLY the missing remainder, ending with </html>.`,
              temperature: 0.5,
              maxTokens: 8192,
            });
          }

          // Completion: split the document at </body> (fallback </html>) so a
          // missing-script repair can be spliced in before the closing tags.
          const lower = accumulated.toLowerCase();
          let cut = lower.lastIndexOf('</body>');
          if (cut === -1) cut = lower.lastIndexOf('</html>');
          const head = cut === -1 ? accumulated : accumulated.slice(0, cut);
          const tail = cut === -1 ? '' : accumulated.slice(cut);

          const missing: string[] = [];
          if (docHasGraphDiv(accumulated) && !docHasGraphJS(accumulated)) {
            missing.push(
              'the interactive Plotly.js Graph Explorer JavaScript: wire BOTH #graph1 and #graph2 with their #slider1/#slider2 range inputs following RULE 2 working pattern exactly (addEventListener input wiring, window.updateGraph1/window.updateGraph2 exposed, live slider value spans #sliderVal1/#sliderVal2 updated, Plotly.react used, initial render called on load)'
            );
          }
          if (docHasCalcDiv(accumulated) && !docHasCalcJS(accumulated)) {
            missing.push(
              'the Interactive Practice Calculator JavaScript for #calcResults following RULE 3 exactly (evalMathExpr evaluator function, calculateResults reading the pre-filled inputs, step-by-step MathJax output, MathJax.typesetPromise call, calculateResults() invoked once on load)'
            );
          }
          if (docHasQuizDiv(accumulated) && !docHasQuizJS(accumulated)) {
            missing.push(
              'the Mastery Challenge Quiz JavaScript exactly as specified in RULE 9 (score tracker #quizScore/#quizTotal, .quiz-opt click feedback with correct/incorrect highlighting and .opt-icon check/cross)'
            );
          }

          if (missing.length > 0 && head.length > 200) {
            try {
              const repair = await streamText({
                model: alibaba(MODEL),
                system: systemPrompt,
                prompt:
                  `Your HTML lesson document is COMPLETE but MISSING its interactive JavaScript. ` +
                  `Write ONLY the missing JavaScript as RAW CODE (no <script> tags, no HTML, no markdown fences, no explanations) - it will be inserted verbatim into a single <script> block right before </body>.\n\n` +
                  `The document ends with:\n\n...${head.slice(-4000)}\n\n` +
                  `Write the complete, working JavaScript for: ${missing.join(' AND ')}. ` +
                  `Wrap everything in DOMContentLoaded. Use EXACTLY the element IDs present in the HTML above. ` +
                  `Follow the working patterns from the system rules (Plotly.react with reusable layout objects, window-exposed update functions, initial renders on load, MathJax.typesetPromise after dynamic HTML).`,
                temperature: 0.2,
                maxTokens: 4096,
              });
              let js = '';
              for await (const d of repair.textStream) js += d;
              js = js
                .trim()
                .replace(/^```(?:javascript|js)?\s*\r?\n?/, '')
                .replace(/\r?\n?```\s*$/, '')
                .trim();
              if (js) {
                const insert = '\n<script>\n' + js + '\n</script>\n';
                emit(head.slice(emitted) + insert + tail);
                emitted = head.length + insert.length + tail.length;
                console.log('[generate] auto-repaired missing script block(s):', missing.length);
              }
            } catch (e2) {
              console.error('[generate] script repair failed:', e2);
            }
          }

          // Flush whatever remains of the document.
          const finalAll = head + tail;
          if (finalAll.length > emitted) {
            emit(finalAll.slice(emitted));
          }
        } catch (e) {
          console.error('[generate] stream error:', e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[generate] error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
