const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve avatar models statically
const avatarDir = path.join(__dirname, 'avatar-model');
app.use('/avatar-model', express.static(avatarDir));

// Endpoint to dynamically list all avatar images in the avatar-model directory
app.get('/api/models', (req, res) => {
  fs.readdir(avatarDir, (err, files) => {
    if (err) {
      console.error('Error reading avatar directory:', err);
      return res.status(500).json({ error: 'Failed to scan avatar models directory' });
    }

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const models = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return imageExtensions.includes(ext);
      })
      .map(file => {
        const ext = path.extname(file);
        const baseName = path.basename(file, ext);
        const formattedName = baseName
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, char => char.toUpperCase());

        return {
          id: file,
          filename: file,
          name: formattedName || file,
          url: `/avatar-model/${file}`
        };
      });

    res.json({ success: true, models, count: models.length });
  });
});

// Helper function to call Google Gemini API
async function generateWithGemini(promptText) {
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.geminiApiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: promptText }]
            }
          ]
        })
      });

      const data = await response.json();

      if (response.ok && data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      } else if (data.error) {
        console.warn(`Gemini model ${modelName} returned error:`, data.error.message);
        lastError = data.error.message;
      }
    } catch (err) {
      console.warn(`Error calling Gemini model ${modelName}:`, err.message);
      lastError = err.message;
    }
  }

  throw new Error(lastError || 'Failed to generate content with Gemini API');
}

// Endpoint to generate UGC script via Gemini API using the Master Prompt structure
app.post('/api/generate-script', async (req, res) => {
  try {
    const { model, productName, cta, instruction, hasProductImage } = req.body;

    if (!config.geminiApiKey) {
      return res.status(400).json({ success: false, error: 'Gemini API key is missing in config.js' });
    }

    const masterPrompt = `Master Prompt: UGC Video Prompt Generator

You are an expert UGC (User Generated Content) video prompt writer for AI video generation models. Your job is to write detailed, structured, scene-by-scene video prompts for 18-second product showcase videos.

The user will provide you with:
Image 1 — Model reference (${model || 'Selected avatar model'})
Image 2 — Product reference (${hasProductImage ? 'Uploaded product image (@Image2)' : 'Product image reference'})
Product Name — ${productName || 'Featured Product'}
CTA — ${cta || 'Get Yours Today!'}
Special Instructions — ${instruction || 'None provided'}

Your Output Must Always Follow This Exact Structure:

【Reference Images】
Always state clearly at the top:
Image1 is the model reference — extract and maintain: face, skin tone, hair color, hair texture, body type, and outfit if visible
Image2 is the product reference — extract and maintain: exact shape, color, material, finish, size, and design details

State this rule explicitly:
"Strictly maintain model face consistency, hair, and outfit across all frames. The product design from Image2 must remain 100% accurate and unchanged in every frame it appears."

【Overall Style】
Based on the product type and special instructions, define:
- Visual mood and aesthetic (warm/cool/clean/moody etc.)
- Camera feel (handheld UGC style, slightly imperfect, natural)
- Color grade and lighting direction
- Background environment suggestion
- Overall tone (genuine, aspirational, lifestyle, luxury etc.)

【Script & Shot Breakdown】
Divide the 18 seconds into exactly 4 scenes. For each scene write:
- Timecode (e.g. 0.0–3.0s)
- A scene title
- The exact voiceover line the model says (in quotation marks, natural UGC language, not salesy)
- Detailed shot description: camera angle, what is visible, model action, product placement, lighting, depth of field, background
- Any transitions or micro-movements

Scene structure must always follow this flow:
- Hook (0–3s) — Product close-up or surprising moment that stops the scroll
- Face Reveal + Reaction (3–7s) — Model appears, genuine expression, introduces product naturally
- Lifestyle B-roll (7–15s) — Series of soft cuts showing product being worn or used naturally, include one clean product-only beauty shot
- CTA Closing (15–18s) — Model speaks directly to camera, warm smile, CTA delivered naturally, final frame holds on model with product clearly visible

【Camera & Technical Requirements】
Always end with these specs:
- Aspect ratio: 9:16 vertical (mobile-first)
- Camera feel: Handheld, natural, slightly warm-shaky, not over-stabilized
- Color grade: Match to product and mood defined above
- Lighting: Soft natural or studio-window light, no harsh shadows
- Audio note: Clear voiceover, subtle ambient background noise underneath
- Product continuity rule: Restate that Image2 product must appear identical in every frame — no design changes, color shifts, or distortions allowed

Rules You Must Always Follow:
- Always label Image 1 as the model and Image 2 as the product — never mix them up
- Voiceover lines must sound natural and human — like a real person talking, not an advertisement
- Never use the words "stunning," "amazing," "gorgeous," or "revolutionary"
- Product must be the visual hero in at least 3 of the 4 scenes
- The hook scene (0–3s) must never show the model's face — only product or a mystery detail
- CTA must use the exact text provided (${cta || 'Get Yours Today!'}), worked naturally into the closing line
- If special instructions conflict with the structure, follow special instructions but note the deviation
- Always write the voiceover in first-person, casual, conversational tone`;

    const generatedText = await generateWithGemini(masterPrompt);

    res.json({
      success: true,
      promptText: generatedText
    });
  } catch (error) {
    console.error('Error generating script:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error while generating script'
    });
  }
});

// Endpoint to Create Video Generation Task on KIE.ai (wan/3-0-video)
app.post('/api/create-video-task', async (req, res) => {
  try {
    const { prompt, modelImageUrl, productImageUrl, resolution, aspectRatio, duration } = req.body;

    if (!config.kieApiKey) {
      return res.status(400).json({ success: false, error: 'KIE API key is missing in config.js' });
    }

    // Process reference image URLs: KIE API requires publicly accessible HTTP/HTTPS URLs
    const referenceImages = [];
    if (modelImageUrl && (modelImageUrl.startsWith('http://') || modelImageUrl.startsWith('https://')) && !modelImageUrl.includes('localhost') && !modelImageUrl.includes('127.0.0.1')) {
      referenceImages.push(modelImageUrl);
    }
    if (productImageUrl && (productImageUrl.startsWith('http://') || productImageUrl.startsWith('https://')) && !productImageUrl.includes('localhost') && !productImageUrl.includes('127.0.0.1')) {
      referenceImages.push(productImageUrl);
    }

    const inputPayload = {
      prompt: prompt,
      resolution: resolution || "720P",
      aspect_ratio: aspectRatio || "9:16",
      duration: duration || 20,
      audio: true
    };

    if (referenceImages.length > 0) {
      inputPayload.reference_image_urls = referenceImages;
    }

    const requestBody = {
      model: "wan/3-0-video",
      input: inputPayload
    };

    console.log("Submitting KIE Video Task request payload:", JSON.stringify(requestBody, null, 2));

    const kieResponse = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.kieApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await kieResponse.json();
    console.log("KIE API createTask response:", data);

    if (data.code === 200 && data.data && data.data.taskId) {
      return res.json({
        success: true,
        code: 200,
        taskId: data.data.taskId,
        msg: data.msg || 'success',
        raw: data
      });
    } else {
      return res.status(data.code || 400).json({
        success: false,
        code: data.code || 400,
        error: data.msg || data.message || `KIE API Error Code: ${data.code}`,
        raw: data
      });
    }
  } catch (error) {
    console.error('Error creating KIE video task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to Poll Video Generation Task Status from KIE.ai
app.get('/api/video-task-status', async (req, res) => {
  try {
    const { taskId } = req.query;

    if (!taskId) {
      return res.status(400).json({ success: false, error: 'taskId parameter is required' });
    }

    if (!config.kieApiKey) {
      return res.status(400).json({ success: false, error: 'KIE API key is missing in config.js' });
    }

    const statusResponse = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.kieApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await statusResponse.json();
    console.log(`KIE Task Status [${taskId}]:`, JSON.stringify(data));

    if (data.code === 200 && data.data) {
      const taskData = data.data;
      const state = (taskData.state || taskData.status || 'generating').toLowerCase();

      let videoUrl = null;
      if (state === 'success' || state === 'completed' || state === 'succeeded') {
        // 1. KIE standard format packs output inside resultJson (stringified JSON)
        if (taskData.resultJson) {
          try {
            const parsed = typeof taskData.resultJson === 'string' ? JSON.parse(taskData.resultJson) : taskData.resultJson;
            if (parsed.resultUrls && Array.isArray(parsed.resultUrls) && parsed.resultUrls[0]) {
              videoUrl = parsed.resultUrls[0];
            } else if (parsed.video_url) {
              videoUrl = parsed.video_url;
            } else if (parsed.url) {
              videoUrl = parsed.url;
            }
          } catch (e) {
            console.error('Error parsing resultJson:', e);
          }
        }

        // 2. Direct top-level fields
        if (!videoUrl) {
          videoUrl = taskData.videoUrl || taskData.video_url || taskData.resultUrl;
        }

        // 3. result field (object or array or string)
        if (!videoUrl && taskData.result) {
          if (typeof taskData.result === 'string') {
            try {
              const parsed = JSON.parse(taskData.result);
              videoUrl = (parsed.resultUrls && parsed.resultUrls[0]) || parsed.video_url || parsed.url;
            } catch (e) {
              if (taskData.result.startsWith('http')) videoUrl = taskData.result;
            }
          } else if (typeof taskData.result === 'object') {
            if (Array.isArray(taskData.result) && taskData.result[0]) {
              videoUrl = typeof taskData.result[0] === 'string' ? taskData.result[0] : (taskData.result[0].video_url || taskData.result[0].url);
            } else {
              videoUrl = taskData.result.video_url || taskData.result.url || (taskData.result.resultUrls && taskData.result.resultUrls[0]);
            }
          }
        }

        // 4. output / response fallbacks
        if (!videoUrl && taskData.output) {
          if (typeof taskData.output === 'string' && taskData.output.startsWith('http')) {
            videoUrl = taskData.output;
          } else if (typeof taskData.output === 'object') {
            videoUrl = taskData.output.video_url || taskData.output.url || (Array.isArray(taskData.output) ? taskData.output[0] : null);
          }
        }

        if (!videoUrl && taskData.response) {
          if (typeof taskData.response === 'object') {
            videoUrl = taskData.response.video_url || taskData.response.url;
          }
        }
      }

      res.json({
        success: true,
        code: 200,
        state: state,
        progress: taskData.progress || 0,
        videoUrl: videoUrl,
        raw: data
      });
    } else {
      res.status(data.code || 400).json({
        success: false,
        code: data.code || 400,
        error: data.msg || data.message || `Status check failed with code ${data.code}`,
        raw: data
      });
    }
  } catch (error) {
    console.error('Error fetching KIE task status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to directly download/stream generated video file with proper download headers
app.get('/api/download-video', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('Video URL parameter is required');
    }

    const videoResponse = await fetch(url);
    if (!videoResponse.ok) {
      return res.status(videoResponse.status).send('Failed to fetch remote video file');
    }

    res.setHeader('Content-Disposition', 'attachment; filename="ugc_wan30_ad.mp4"');
    res.setHeader('Content-Type', videoResponse.headers.get('content-type') || 'video/mp4');

    const arrayBuffer = await videoResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Error downloading video via proxy:', error);
    res.status(500).send('Error downloading video');
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`UGC Ads Generator server started!`);
    console.log(`Authenticated as user: ${config.username}`);
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`=================================`);
  });
}

module.exports = app;
