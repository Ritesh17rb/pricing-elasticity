/**
 * Step Navigation System
 * Keeps the Pizza Hut build on the same step shell pattern as pricingstudio.
 */

const TOTAL_STEPS = 10; // 0-9
let currentStep = 0;
const stepSectionMap = {
  0: 'section-0',
  1: 'section-1',
  2: 'section-2',
  3: 'section-8',
  4: 'section-6',
  5: 'section-7',
  6: 'section-3',
  7: 'section-4',
  8: 'section-5',
  9: 'section-9'
};

function goToStep(step) {
  if (step < 0 || step >= TOTAL_STEPS) return;

  document.querySelectorAll('.section').forEach((section) => section.classList.remove('active'));

  const sectionId = stepSectionMap[step];
  const section = sectionId ? document.getElementById(sectionId) : null;
  if (section) {
    section.classList.add('active');
  }

  document.querySelectorAll('.step-dot').forEach((dot) => {
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
  if (step !== 9) {
    window.yumChatPinnedScreenId = null;
  }
  if (sectionId && !['section-0', 'section-9'].includes(sectionId)) {
    window.yumLastAnalysisSectionId = sectionId;
  }

  showStepContent(step);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showStepContent(step) {
  const allSections = [
    'load-data-section',
    'kpi-section',
    'elasticity-models-section',
    'comparison-section',
    'analytics-section',
    'segmentation-section',
    'segment-analysis-section',
    'event-calendar-section',
    'data-viewer-section',
    'chat-section'
  ];

  allSections.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    if (id === 'elasticity-models-section') {
      el.classList.remove('hide-elasticity-tabs');
    }
  });

  switch (step) {
    case 0:
      break;
    case 1:
      if (window.loadAppData && !window.dataLoaded) {
        window.dataLoaded = true;
        window.postLoadStep = 1;

        setTimeout(() => {
          const loadSection = document.getElementById('load-data-section');
          const loadingProgress = document.getElementById('loading-progress');
          if (loadSection) {
            loadSection.style.display = 'block';
            loadSection.style.visibility = 'visible';
            loadSection.style.opacity = '1';
          }
          if (loadingProgress) {
            loadingProgress.style.display = 'block';
            loadingProgress.style.visibility = 'visible';
          }

          window.loadAppData().catch((error) => {
            console.error('Failed to load data:', error);
            window.dataLoaded = false;
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
        }, 100);
      } else {
        const kpiSection = document.getElementById('kpi-section');
        if (kpiSection) {
          kpiSection.style.display = 'block';
        }
      }
      break;
    case 2: {
      const dataViewerSection = document.getElementById('data-viewer-section');
      const contentArea = document.getElementById('step-2-data-viewer-container-content');
      if (dataViewerSection && contentArea) {
        dataViewerSection.style.display = 'block';
        if (dataViewerSection.parentElement !== contentArea) {
          contentArea.appendChild(dataViewerSection);
        }
      }
      break;
    }
    case 3: {
      const eventCalendarSection = document.getElementById('event-calendar-section');
      const contentArea = document.getElementById('step-8-calendar-container-content');
      if (eventCalendarSection && contentArea) {
        eventCalendarSection.style.display = 'block';
        if (eventCalendarSection.parentElement !== contentArea) {
          contentArea.appendChild(eventCalendarSection);
        }
      }
      break;
    }
    case 4: {
      const segmentationSection = document.getElementById('segmentation-section');
      const contentArea = document.getElementById('step-6-segmentation-container-content');
      if (segmentationSection && contentArea) {
        segmentationSection.style.display = 'block';
        if (segmentationSection.parentElement !== contentArea) {
          contentArea.appendChild(segmentationSection);
        }
      }
      break;
    }
    case 5: {
      const segmentAnalysisSection = document.getElementById('segment-analysis-section');
      const contentArea = document.getElementById('step-7-analysis-container-content');
      if (segmentAnalysisSection && contentArea) {
        segmentAnalysisSection.style.display = 'block';
        if (segmentAnalysisSection.parentElement !== contentArea) {
          contentArea.appendChild(segmentAnalysisSection);
        }
      }
      break;
    }
    case 6:
      showElasticityModel('acquisition', 'step-3-acquisition-container');
      if (window.initAcquisitionSimple && typeof window.initAcquisitionSimple === 'function') {
        setTimeout(() => window.initAcquisitionSimple(), 100);
      }
      break;
    case 7:
      showElasticityModel('churn', 'step-4-churn-container');
      if (window.initChurnSimple && typeof window.initChurnSimple === 'function') {
        setTimeout(() => window.initChurnSimple(), 100);
      }
      break;
    case 8:
      showElasticityModel('migration', 'step-5-migration-container');
      if (window.initMigrationSimple && typeof window.initMigrationSimple === 'function') {
        setTimeout(() => window.initMigrationSimple(), 100);
      }
      break;
    case 9: {
      const chatSection = document.getElementById('chat-section');
      const contentArea = document.getElementById('step-9-chat-container-content');
      if (chatSection && contentArea) {
        chatSection.style.display = 'block';
        if (chatSection.parentElement !== contentArea) {
          contentArea.appendChild(chatSection);
        }
      }
      break;
    }
  }
}

function showElasticityModel(modelType, containerId) {
  const elasticityModelsSection = document.getElementById('elasticity-models-section');
  const contentArea = document.getElementById(`${containerId}-content`);

  if (!elasticityModelsSection || !contentArea) return;

  if (window.hideScenarioResults && typeof window.hideScenarioResults === 'function') {
    window.hideScenarioResults();
  }

  elasticityModelsSection.style.display = 'block';

  if (elasticityModelsSection.parentElement !== contentArea) {
    contentArea.appendChild(elasticityModelsSection);
  }

  const tabNav = elasticityModelsSection.querySelector('.nav-tabs');
  if (tabNav) {
    tabNav.style.display = 'none';
  }

  elasticityModelsSection.querySelectorAll('.tab-pane').forEach((tab) => {
    tab.classList.remove('show', 'active');
  });

  let targetTabId = '';
  if (modelType === 'acquisition') targetTabId = 'acquisition-pane';
  if (modelType === 'churn') targetTabId = 'churn-pane';
  if (modelType === 'migration') targetTabId = 'migration-pane';

  const targetTab = document.getElementById(targetTabId);
  if (targetTab) {
    targetTab.classList.add('show', 'active');
  }

  if (window.setActiveModelType && typeof window.setActiveModelType === 'function') {
    window.setActiveModelType(modelType);
  }
  if (window.populateElasticityModelTabs && typeof window.populateElasticityModelTabs === 'function') {
    window.populateElasticityModelTabs();
  }
  if (window.getCurrentResultForModel && typeof window.getCurrentResultForModel === 'function') {
    const modelResult = window.getCurrentResultForModel(modelType);
    if (!modelResult && window.hideScenarioResults && typeof window.hideScenarioResults === 'function') {
      window.hideScenarioResults();
    }
  }
}

function createStepNavigation(prevStep, nextStep, nextLabel = 'Next') {
  const nav = document.createElement('div');
  nav.className = 'section-header-nav';

  if (prevStep !== null) {
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary-custom';
    backBtn.onclick = () => goToStep(prevStep);
    backBtn.innerHTML = '<i class="bi bi-arrow-left me-2"></i> Back';
    nav.appendChild(backBtn);
  }

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

function injectStepNavigations() {
  const stepConfigs = [
    { step: 2, container: 'step-2-data-viewer-container', prev: 1, next: 3, nextLabel: 'Next: Event Calendar' },
    { step: 3, container: 'step-8-calendar-container', prev: 2, next: 4, nextLabel: 'Next: Customer Cohorts' },
    { step: 4, container: 'step-6-segmentation-container', prev: 3, next: 5, nextLabel: 'Next: Segment Comparison' },
    { step: 5, container: 'step-7-analysis-container', prev: 4, next: 6, nextLabel: 'Next: Acquisition Elasticity' },
    { step: 6, container: 'step-3-acquisition-container', prev: 5, next: 7, nextLabel: 'Next: Churn Elasticity' },
    { step: 7, container: 'step-4-churn-container', prev: 6, next: 8, nextLabel: 'Next: Order Channel Migration' },
    { step: 8, container: 'step-5-migration-container', prev: 7, next: 9, nextLabel: 'Next: AI Chat & Advanced Analytics' },
    { step: 9, container: 'step-9-chat-container', prev: 8, next: 0, nextLabel: null }
  ];

  stepConfigs.forEach((config) => {
    const container = document.getElementById(config.container);
    if (!container) return;

    const topNav = createStepNavigation(config.prev, config.next, config.nextLabel);
    topNav.classList.add('step-nav-top');

    const contentArea = document.createElement('div');
    contentArea.classList.add('step-content-area');
    contentArea.id = `${config.container}-content`;

    const bottomNav = createStepNavigation(config.prev, config.next, config.nextLabel);
    bottomNav.classList.add('step-nav-bottom');

    container.innerHTML = '';
    container.appendChild(topNav);
    container.appendChild(contentArea);
    container.appendChild(bottomNav);
  });
}

function initStepNavigation() {
  document.querySelectorAll('.step-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step, 10);
      goToStep(step);
    });
  });

  injectStepNavigations();
  goToStep(0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStepNavigation);
} else {
  initStepNavigation();
}

window.goToStep = goToStep;
