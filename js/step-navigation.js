/**
 * Step Navigation System
 * Manages the simplified Yum Brands demo flow.
 */

const TOTAL_STEPS = 8; // 0-7
let currentStep = 0;
const stepSectionMap = {
  0: 'section-0',
  1: 'section-10',
  2: 'section-1',
  3: 'section-6',
  4: 'section-7',
  5: 'section-3',
  6: 'section-8',
  7: 'section-9'
};

/**
 * Navigate to a specific step
 * @param {number} step - Step number (0-7)
 */
function goToStep(step) {
  if (step < 0 || step >= TOTAL_STEPS) return;

  const isInitialLoadingStep = step === 1 && Boolean(window.loadAppData) && !window.dataLoaded;
  if (isInitialLoadingStep) {
    window.postLoadStep = 1;
  }
  if (isInitialLoadingStep) {
    document.body.classList.add('app-loading-step');
    const loadSection = document.getElementById('load-data-section');
    const loadingProgress = document.getElementById('loading-progress');
    if (loadSection) {
      loadSection.style.display = 'flex';
      loadSection.style.visibility = 'visible';
      loadSection.style.opacity = '1';
    }
    if (loadingProgress) {
      loadingProgress.style.display = 'none';
      loadingProgress.style.visibility = 'hidden';
    }
  }

  // Hide all section wrappers
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  // Show the target section wrapper
  const sectionId = isInitialLoadingStep ? 'section-1' : stepSectionMap[step];
  const section = sectionId ? document.getElementById(sectionId) : null;
  if (section) {
    section.classList.add('active');
  }

  // Update step indicators
  document.querySelectorAll('.step-dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step, 10);
    dot.classList.remove('active', 'completed');
    if (!Number.isNaN(dotStep) && dotStep < step) {
      dot.classList.add('completed');
    } else if (dotStep === step) {
      dot.classList.add('active');
    }
  });

  currentStep = step;
  window.yumCurrentStep = step;
  window.yumCurrentSectionId = sectionId;
  if (step !== 7) {
    window.yumChatPinnedScreenId = null;
  }
  if (sectionId && !['section-0', 'section-9'].includes(sectionId)) {
    window.yumLastAnalysisSectionId = sectionId;
  }

  // Show/hide appropriate original content sections
  showStepContent(step);

  // Scroll to top
  window.scrollTo({ top: 0, behavior: isInitialLoadingStep ? 'auto' : 'smooth' });
}

/**
 * Show content for the current step
 * @param {number} step - Step number
 */
function showStepContent(step) {
  // Hide all original content sections
  const allSections = [
    'load-data-section',
    'kpi-section',
    'elasticity-models-section',
    'comparison-section',
    'analytics-section',
    'segmentation-section',
    'segment-analysis-section',
    'event-calendar-section',
    'yum-studio-section',
    'data-viewer-section',
    'chat-section'
  ];

  allSections.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      // Remove hide-tabs class when hiding elasticity section
      if (id === 'elasticity-models-section') {
        el.classList.remove('hide-elasticity-tabs');
      }
    }
  });

  // Show sections based on current step
  switch(step) {
    case 0:
      // Hero - no additional content
      break;
    case 1:
      // Data Explorer is the first screen after the initial load finishes.
      // While loading, section-1 acts as the fullscreen loader host.
      if (window.loadAppData && !window.dataLoaded) {
        window.dataLoaded = true; // Set immediately to prevent multiple calls
        window.postLoadStep = 1;
        document.body.classList.add('app-loading-step');

        const loadSection = document.getElementById('load-data-section');
        const loadingProgress = document.getElementById('loading-progress');
        if (loadSection) {
          loadSection.style.display = 'flex';
          loadSection.style.visibility = 'visible';
          loadSection.style.opacity = '1';
        }
        if (loadingProgress) {
          loadingProgress.style.display = 'none';
          loadingProgress.style.visibility = 'hidden';
        }

        requestAnimationFrame(() => {
          window.loadAppData().catch(error => {
            console.error('Failed to load data:', error);
            window.dataLoaded = false; // Reset on error
            document.body.classList.remove('app-loading-step');
            // Show error message to user
            if (loadSection) {
              loadSection.innerHTML = `
                <div class="glass-card">
                  <div class="alert alert-danger mb-0">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <strong>Failed to load data.</strong> ${error.message}
                    <button class="btn btn-sm btn-outline-danger ms-3" onclick="location.reload()">Retry</button>
                  </div>
                </div>
              `;
            }
          });
        });
      } else {
        const dataViewerSection = document.getElementById('data-viewer-section');
        const dataViewerContentArea = document.getElementById('step-3-data-viewer-container-content');
        if (dataViewerSection && dataViewerContentArea) {
          dataViewerSection.style.display = 'block';
          if (dataViewerSection.parentElement !== dataViewerContentArea) {
            dataViewerContentArea.appendChild(dataViewerSection);
          }
        }
      }
      break;
    case 2:
      // Current Business Overview
      if (window.loadAppData && !window.dataLoaded) {
        window.dataLoaded = true;
        window.postLoadStep = 2;
        document.body.classList.add('app-loading-step');

        const loadSection = document.getElementById('load-data-section');
        const loadingProgress = document.getElementById('loading-progress');
        if (loadSection) {
          loadSection.style.display = 'flex';
          loadSection.style.visibility = 'visible';
          loadSection.style.opacity = '1';
        }
        if (loadingProgress) {
          loadingProgress.style.display = 'none';
          loadingProgress.style.visibility = 'hidden';
        }

        requestAnimationFrame(() => {
          window.loadAppData().catch(error => {
            console.error('Failed to load data:', error);
            window.dataLoaded = false;
            document.body.classList.remove('app-loading-step');
          });
        });
      } else {
        const kpiSection = document.getElementById('kpi-section');
        if (kpiSection) {
          kpiSection.style.display = 'block';
        }
      }
      break;
    case 3:
      // Customer Cohorts & Elasticity (segmentation only)
      const segmentationSection6 = document.getElementById('segmentation-section');
      const segmentContentArea6 = document.getElementById('step-6-segmentation-container-content');
      if (segmentationSection6 && segmentContentArea6) {
        segmentationSection6.style.display = 'block';
        if (segmentationSection6.parentElement !== segmentContentArea6) {
          segmentContentArea6.appendChild(segmentationSection6);
        }
      }
      break;
    case 4:
      // Segment Elasticity Comparison (analysis only)
      const segmentAnalysisSection7 = document.getElementById('segment-analysis-section');
      const analysisContentArea7 = document.getElementById('step-7-analysis-container-content');
      if (segmentAnalysisSection7 && analysisContentArea7) {
        segmentAnalysisSection7.style.display = 'block';
        if (segmentAnalysisSection7.parentElement !== analysisContentArea7) {
          analysisContentArea7.appendChild(segmentAnalysisSection7);
        }
      }
      break;
    case 5:
      // Acquisition Elasticity - Show elasticity models, force Acquisition tab, hide tabs
      showElasticityModel('acquisition', 'step-3-acquisition-container');
      // Initialize simplified acquisition model
      if (window.initAcquisitionSimple && typeof window.initAcquisitionSimple === 'function') {
        // Small delay to ensure DOM is ready
        setTimeout(() => window.initAcquisitionSimple(), 100);
      }
      break;
    case 6:
      // Event Calendar / Promotion context
      const eventCalendarSection = document.getElementById('event-calendar-section');
      const calendarContentArea = document.getElementById('step-8-calendar-container-content');
      if (eventCalendarSection && calendarContentArea) {
        eventCalendarSection.style.display = 'block';
        if (eventCalendarSection.parentElement !== calendarContentArea) {
          calendarContentArea.appendChild(eventCalendarSection);
        }
      }
      break;
    case 7:
      // Chat & Advanced Tools
      const chatSection = document.getElementById('chat-section');
      const chatContentArea = document.getElementById('step-9-chat-container-content');
      if (chatSection && chatContentArea) {
        chatSection.style.display = 'block';
        if (chatSection.parentElement !== chatContentArea) {
          chatContentArea.appendChild(chatSection);
        }
      }
      break;
  }
}

/**
 * Helper function to show elasticity model for a specific tab
 * @param {string} modelType - 'acquisition', 'churn', or 'migration'
 * @param {string} containerId - ID of the container to append content to
 */
function showElasticityModel(modelType, containerId) {
  const elasticityModelsSection = document.getElementById('elasticity-models-section');
  const contentArea = document.getElementById(`${containerId}-content`);

  if (!elasticityModelsSection || !contentArea) return;

  if (window.hideScenarioResults && typeof window.hideScenarioResults === 'function') {
    window.hideScenarioResults();
  }

  // Show ONLY the elasticity models section (scenario engine)
  // NOT the comparison or analytics sections - those are separate
  elasticityModelsSection.style.display = 'block';

  // Move it into the content area if not already there
  if (elasticityModelsSection.parentElement !== contentArea) {
    contentArea.appendChild(elasticityModelsSection);
  }

  // Hide the tab navigation (we'll show content directly)
  const tabNav = elasticityModelsSection.querySelector('.nav-tabs');
  if (tabNav) {
    tabNav.style.display = 'none';
  }

  // Activate the correct tab pane
  const allTabs = elasticityModelsSection.querySelectorAll('.tab-pane');
  allTabs.forEach(tab => {
    tab.classList.remove('show', 'active');
  });

  // Show the specific tab based on modelType
  let targetTabId = '';
  if (modelType === 'acquisition') {
    targetTabId = 'acquisition-pane';
  } else if (modelType === 'churn') {
    targetTabId = 'churn-pane';
  } else if (modelType === 'migration') {
    targetTabId = 'migration-pane';
  }

  const targetTab = document.getElementById(targetTabId);
  if (targetTab) {
    targetTab.classList.add('show', 'active');
  }

  if (window.setActiveModelType && typeof window.setActiveModelType === 'function') {
    window.setActiveModelType(modelType);
  }

  // Ensure scenario cards are populated
  if (window.populateElasticityModelTabs && typeof window.populateElasticityModelTabs === 'function') {
    window.populateElasticityModelTabs();
  }

  // If the target model has no results yet, ensure results stay hidden
  if (window.getCurrentResultForModel && typeof window.getCurrentResultForModel === 'function') {
    const modelResult = window.getCurrentResultForModel(modelType);
    if (!modelResult && window.hideScenarioResults && typeof window.hideScenarioResults === 'function') {
      window.hideScenarioResults();
    }
  }
}

/**
 * Create navigation buttons for a step
 * @param {number} prevStep - Previous step number
 * @param {number} nextStep - Next step number
 * @param {string} nextLabel - Label for next button
 * @returns {HTMLElement} Navigation div element
 */
function createStepNavigation(prevStep, nextStep, nextLabel = 'Next') {
  const nav = document.createElement('div');
  nav.className = 'section-header-nav';

  // Back button
  if (prevStep !== null) {
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary-custom';
    backBtn.onclick = () => goToStep(prevStep);
    backBtn.innerHTML = '<i class="bi bi-arrow-left me-2"></i> Back';
    nav.appendChild(backBtn);
  }

  // Next button
  if (nextStep !== null) {
    const nextBtn = document.createElement('button');
    nextBtn.className = nextStep === 0 ? 'btn btn-secondary-custom' : 'btn btn-primary-custom';
    nextBtn.onclick = () => goToStep(nextStep);

    if (nextStep === 0) {
      nextBtn.innerHTML = '<i class="bi bi-house me-2"></i> Back to Start';
    } else {
      nextBtn.innerHTML = `${nextLabel} <i class="bi bi-arrow-right ms-2"></i>`;
    }
    nav.appendChild(nextBtn);
  }

  return nav;
}

/**
 * Inject navigation buttons into step containers
 */
function injectStepNavigations() {
  const stepConfigs = [
    { step: 1, container: 'step-3-data-viewer-container', prev: 0, next: 2, nextLabel: 'Next: Current Business Overview' },
    { step: 3, container: 'step-6-segmentation-container', prev: 2, next: 4, nextLabel: 'Next: Segment Comparison' },
    { step: 4, container: 'step-7-analysis-container', prev: 3, next: 5, nextLabel: 'Next: Traffic Acquisition' },
    { step: 5, container: 'step-3-acquisition-container', prev: 4, next: 6, nextLabel: 'Next: Promotion Performance' },
    { step: 6, container: 'step-8-calendar-container', prev: 5, next: 7, nextLabel: 'Next: AI Chat & Decision Support' },
    { step: 7, container: 'step-9-chat-container', prev: 6, next: 0, nextLabel: null }
  ];

  stepConfigs.forEach(config => {
    const container = document.getElementById(config.container);
    if (!container) return;

    // Create wrapper structure: top-nav, content-area, bottom-nav
    const topNav = createStepNavigation(config.prev, config.next, config.nextLabel);
    topNav.classList.add('step-nav-top');

    const contentArea = document.createElement('div');
    contentArea.classList.add('step-content-area');
    contentArea.id = `${config.container}-content`;

    const bottomNav = createStepNavigation(config.prev, config.next, config.nextLabel);
    bottomNav.classList.add('step-nav-bottom');

    // Clear container and append in order
    container.innerHTML = '';
    container.appendChild(topNav);
    container.appendChild(contentArea);
    container.appendChild(bottomNav);
  });
}

/**
 * Initialize the steps overview modal behavior
 */
function initStepsOverviewModal() {
  const modalEl = document.getElementById('stepsOverviewModal');
  if (!modalEl || !window.bootstrap) return;

  modalEl.querySelectorAll('.steps-table-row').forEach(item => {
    item.addEventListener('click', () => {
      const step = parseInt(item.dataset.step, 10);
      if (Number.isNaN(step)) return;

      const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
      modalEl.addEventListener('hidden.bs.modal', () => {
        goToStep(step);
      }, { once: true });
      modalInstance.hide();
    });
  });
}

/**
 * Initialize step navigation
 */
function initStepNavigation() {
  // Add click handlers to step dots
  document.querySelectorAll('.step-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step);
      goToStep(step);
    });
  });

  // Inject navigation buttons for all steps
  injectStepNavigations();

  // Hook up steps overview modal
  initStepsOverviewModal();

  // Start at step 0 (hero)
  goToStep(0);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStepNavigation);
} else {
  initStepNavigation();
}

// Make goToStep available globally for onclick handlers
window.goToStep = goToStep;
