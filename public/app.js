document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const modelGrid = document.getElementById('model-grid');
  const selectedModelInput = document.getElementById('selected-model-id');
  const modelCountBadge = document.getElementById('model-count-badge');

  const uploadZone = document.getElementById('upload-zone');
  const productImgInput = document.getElementById('product-img-input');
  const uploadContent = document.getElementById('upload-content');
  const uploadPreview = document.getElementById('upload-preview');
  const previewImg = document.getElementById('preview-img');
  const previewFilename = document.getElementById('preview-filename');
  const removeImgBtn = document.getElementById('remove-img-btn');

  const publicModelUrlInput = document.getElementById('public-model-url');
  const publicProductUrlInput = document.getElementById('public-product-url');

  const generateBtn = document.getElementById('generate-script-btn');
  const btnText = document.getElementById('btn-text');

  // Result Card Elements
  const resultCard = document.getElementById('result-card');
  const promptOutputTextarea = document.getElementById('prompt-output-textarea');
  const editPromptBtn = document.getElementById('edit-prompt-btn');
  const editBtnLabel = document.getElementById('edit-btn-label');
  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn = document.getElementById('reject-btn');

  // Video Generation Card Elements
  const videoGenerationCard = document.getElementById('video-generation-card');
  const taskIdBadge = document.getElementById('task-id-badge');
  const videoLoadingSection = document.getElementById('video-loading-section');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const videoStatusText = document.getElementById('video-status-text');
  const videoTimerCounter = document.getElementById('video-timer-counter');

  const videoResultOutput = document.getElementById('video-result-output');
  const outputVideoPlayer = document.getElementById('output-video-player');
  const downloadVideoBtn = document.getElementById('download-video-btn');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const payOptionBtn = document.getElementById('pay-option-btn');

  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  let availableModels = [];
  let selectedModelId = null;
  let activeTaskId = null;
  let pollInterval = null;
  let timerInterval = null;
  let elapsedSeconds = 0;
  let generatedVideoUrl = '';

  // 1. Load avatar models from backend API /api/models
  async function loadAvatarModels() {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();

      if (data.success && Array.isArray(data.models)) {
        availableModels = data.models;
        renderModels(availableModels);
      } else {
        renderError('No models found in avatar-model folder');
      }
    } catch (err) {
      console.error('Failed to load avatar models:', err);
      renderError('Failed to load avatar models');
    }
  }

  function renderModels(models) {
    modelGrid.innerHTML = '';
    modelCountBadge.textContent = `${models.length} Available`;

    if (models.length === 0) {
      modelGrid.innerHTML = `
        <div class="loading-spinner">
          <p>📁 No images found in avatar-model/ folder.</p>
          <small style="color: #6b7280;">Add images to avatar-model/ and refresh!</small>
        </div>
      `;
      return;
    }

    models.forEach((model, index) => {
      const card = document.createElement('div');
      card.className = `model-card ${index === 0 ? 'selected' : ''}`;
      card.dataset.modelId = model.id;

      card.innerHTML = `
        <div class="model-img-wrapper">
          <img src="${model.url}" alt="${model.name}" class="model-img" loading="lazy">
        </div>
        <span class="model-name">${model.name}</span>
      `;

      card.addEventListener('click', () => selectModel(model.id));
      modelGrid.appendChild(card);
    });

    if (models.length > 0) {
      selectModel(models[0].id);
    }
  }

  function renderError(message) {
    modelGrid.innerHTML = `<div class="loading-spinner"><p>${message}</p></div>`;
    modelCountBadge.textContent = '0 Models';
  }

  function selectModel(modelId) {
    selectedModelId = modelId;
    selectedModelInput.value = modelId;

    const cards = modelGrid.querySelectorAll('.model-card');
    cards.forEach(card => {
      if (card.dataset.modelId === modelId) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  // 2. Product Image Drag & Drop Preview
  productImgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      displayPreview(file);
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
    }, false);
  });

  uploadZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      productImgInput.files = files;
      displayPreview(files[0]);
    }
  });

  function displayPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewFilename.textContent = file.name;
      uploadContent.classList.add('hidden');
      uploadPreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  removeImgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    productImgInput.value = '';
    previewImg.src = '';
    previewFilename.textContent = '';
    uploadPreview.classList.add('hidden');
    uploadContent.classList.remove('hidden');
  });

  // 3. Generate Script with Gemini API Call
  generateBtn.addEventListener('click', async () => {
    const productName = document.getElementById('product-name').value.trim();
    const cta = document.getElementById('cta-text').value.trim();
    const instruction = document.getElementById('instructions').value.trim();

    if (!productName) {
      showToast('⚠️ Please enter a Product Name first.');
      document.getElementById('product-name').focus();
      return;
    }

    if (!cta) {
      showToast('⚠️ Please enter a Call to Action (CTA).');
      document.getElementById('cta-text').focus();
      return;
    }

    generateBtn.disabled = true;
    btnText.textContent = 'Generating with Gemini AI...';

    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModelId,
          productName,
          cta,
          instruction,
          hasProductImage: productImgInput.files.length > 0 || publicProductUrlInput.value.trim() !== ''
        })
      });

      const data = await response.json();

      if (data.success && data.promptText) {
        promptOutputTextarea.value = data.promptText;
        resultCard.classList.remove('hidden');
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('✨ Video generation prompt created successfully!');
      } else {
        showToast(`❌ Error: ${data.error || 'Failed to generate script'}`);
      }
    } catch (err) {
      console.error('API Error:', err);
      showToast('❌ Server request failed. Check server logs.');
    } finally {
      generateBtn.disabled = false;
      btnText.textContent = 'Generate script';
    }
  });

  // 4. Edit Prompt Button Handler (Pencil Icon)
  editPromptBtn.addEventListener('click', () => {
    const isReadOnly = promptOutputTextarea.hasAttribute('readonly');
    if (isReadOnly) {
      promptOutputTextarea.removeAttribute('readonly');
      promptOutputTextarea.focus();
      editBtnLabel.textContent = 'Done';
      editPromptBtn.classList.add('editing');
      showToast('✏️ You can now edit the prompt script.');
    } else {
      promptOutputTextarea.setAttribute('readonly', 'true');
      editBtnLabel.textContent = 'Edit';
      editPromptBtn.classList.remove('editing');
      showToast('🔒 Edits saved.');
    }
  });

  // 5. Approve Button Handler -> Submit Task to KIE.ai WAN 3.0 Video API
  approveBtn.addEventListener('click', async () => {
    const promptText = promptOutputTextarea.value.trim();
    if (!promptText) {
      showToast('⚠️ Prompt is empty. Please generate or enter a prompt.');
      return;
    }

    // Reveal Video Generation Card
    videoGenerationCard.classList.remove('hidden');
    videoLoadingSection.classList.remove('hidden');
    videoResultOutput.classList.add('hidden');
    videoGenerationCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Reset progress & timer
    progressBarFill.style.width = '10%';
    videoStatusText.textContent = '🚀 Submitting task to KIE.ai wan/3-0-video...';
    taskIdBadge.textContent = 'Task ID: Submitting...';
    startTimer();

    const modelImageUrl = publicModelUrlInput.value.trim();
    const productImageUrl = publicProductUrlInput.value.trim();

    try {
      const response = await fetch('/api/create-video-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          modelImageUrl: modelImageUrl,
          productImageUrl: productImageUrl,
          resolution: '720P',
          aspectRatio: '9:16',
          duration: 20
        })
      });

      const data = await response.json();

      if ((data.code === 200 || data.success) && data.taskId) {
        activeTaskId = data.taskId;
        taskIdBadge.textContent = `Task ID: ${activeTaskId}`;
        videoStatusText.textContent = `⚙️ Task created [${activeTaskId}]. Polling every 15s...`;
        progressBarFill.style.width = '25%';
        showToast(`🎉 Video task created! ID: ${activeTaskId}`);

        // Start polling status every 15s
        startPolling(activeTaskId);
      } else {
        videoStatusText.textContent = `❌ Error [Code ${data.code || 400}]: ${data.error || 'Failed to create task'}`;
        progressBarFill.style.width = '0%';
        stopTimer();
        showToast(`❌ Error: ${data.error || 'Task creation failed'}`);
      }
    } catch (err) {
      console.error('Error creating video task:', err);
      videoStatusText.textContent = '❌ Server connection error.';
      stopTimer();
      showToast('❌ Server connection error');
    }
  });

  // Polling logic for KIE video status
  function startPolling(taskId) {
    if (pollInterval) clearInterval(pollInterval);

    pollStatus(taskId);

    pollInterval = setInterval(() => {
      // 10 minutes timeout (600 seconds)
      if (elapsedSeconds >= 600) {
        stopPolling();
        stopTimer();
        videoStatusText.textContent = '⏰ Video generation timed out after 10 minutes. Polling stopped.';
        showToast('⏳ Video generation timed out (10 mins).');
        return;
      }
      pollStatus(taskId);
    }, 15000);
  }

  async function pollStatus(taskId) {
    try {
      const response = await fetch(`/api/video-task-status?taskId=${taskId}`);
      const data = await response.json();

      if (data.code === 200 || data.success) {
        const state = (data.state || '').toLowerCase();

        if (state === 'success' || state === 'completed' || state === 'succeeded') {
          stopPolling();
          stopTimer();
          progressBarFill.style.width = '100%';
          videoStatusText.textContent = '✅ Video generation completed successfully!';

          generatedVideoUrl = data.videoUrl || '';
          renderVideoResult(generatedVideoUrl);
          showToast('🎬 Video render ready!');
        } else if (state === 'fail' || state === 'failed') {
          stopPolling();
          stopTimer();
          progressBarFill.style.width = '0%';
          videoStatusText.textContent = `❌ Video task failed: ${data.error || 'KIE generation failed'}`;
          showToast('❌ Video generation failed');
        } else {
          // Progress simulation / state status (waiting, queuing, generating)
          videoStatusText.textContent = `⏳ Task State: ${state.toUpperCase()}... Polling every 15s...`;
          const currentWidth = parseInt(progressBarFill.style.width) || 25;
          if (currentWidth < 90) {
            progressBarFill.style.width = `${currentWidth + 10}%`;
          }
        }
      }
    } catch (err) {
      console.error('Error polling status:', err);
    }
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function startTimer() {
    stopTimer();
    elapsedSeconds = 0;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      elapsedSeconds++;
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const secs = String(elapsedSeconds % 60).padStart(2, '0');
    videoTimerCounter.textContent = `Elapsed: ${mins}:${secs} (Timeout: 10m)`;
  }

  function renderVideoResult(url) {
    videoLoadingSection.classList.add('hidden');
    videoResultOutput.classList.remove('hidden');

    if (url) {
      outputVideoPlayer.src = url;
    }
  }

  // 6. Video Output Action Handlers
  downloadVideoBtn.addEventListener('click', () => {
    const videoUrl = generatedVideoUrl || outputVideoPlayer.src;
    if (videoUrl && videoUrl !== window.location.href) {
      showToast('⬇️ Starting video download...');
      const downloadEndpoint = `/api/download-video?url=${encodeURIComponent(videoUrl)}`;
      const a = document.createElement('a');
      a.href = downloadEndpoint;
      a.download = 'ugc_wan30_ad.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('✅ Download initiated!');
    } else {
      showToast('⚠️ Video URL not ready or empty. Checking status...');
      if (activeTaskId) {
        pollStatus(activeTaskId);
      }
    }
  });

  copyLinkBtn.addEventListener('click', () => {
    const videoUrl = generatedVideoUrl || outputVideoPlayer.src;
    if (videoUrl && videoUrl !== window.location.href) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(videoUrl).then(() => {
          showToast('📋 Video URL copied to clipboard!');
        }).catch(() => {
          fallbackCopyText(videoUrl);
        });
      } else {
        fallbackCopyText(videoUrl);
      }
    } else {
      showToast('⚠️ No video URL to copy yet.');
    }
  });

  function fallbackCopyText(text) {
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.style.position = 'fixed';
    tempInput.style.opacity = '0';
    document.body.appendChild(tempInput);
    tempInput.focus();
    tempInput.select();
    try {
      document.execCommand('copy');
      showToast('📋 Video URL copied to clipboard!');
    } catch (e) {
      showToast('❌ Could not copy URL');
    }
    document.body.removeChild(tempInput);
  }

  payOptionBtn.addEventListener('click', () => {
    showToast('💳 Pay option clicked! Redirecting to checkout...');
  });

  // 7. Reject Button Handler (Refreshes the page)
  rejectBtn.addEventListener('click', () => {
    showToast('🔄 Page refreshing...');
    setTimeout(() => {
      window.location.reload();
    }, 500);
  });

  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3500);
  }

  // Initialize
  loadAvatarModels();
});
