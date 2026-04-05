export const DEFAULT_YUM_BRAND_ID = 'tacobell';

export const YUM_BRAND_ORDER = ['tacobell', 'kfc', 'pizzahut', 'habitburger'];

export const YUM_BRAND_LABELS = {
  tacobell: 'Taco Bell',
  kfc: 'KFC',
  pizzahut: 'Pizza Hut',
  habitburger: 'Habit Burger & Grill'
};

export const YUM_CHANNEL_ORDER = [
  'drive_thru',
  'dine_in',
  'carryout',
  'pickup_app',
  'delivery',
  'in_store',
  'pickup'
];

const YUM_CHANNEL_LABELS = {
  drive_thru: 'Drive-Thru',
  dine_in: 'Dine-In',
  carryout: 'Carryout',
  pickup_app: 'Pickup / App',
  delivery: 'Delivery',
  in_store: 'In-Store / Counter',
  pickup: 'Pickup / App'
};

export function getYumBrandLabel(brandId) {
  return YUM_BRAND_LABELS[brandId] || brandId || 'Yum Concept';
}

export function sortYumBrandIds(brandIds = []) {
  const unique = [...new Set(brandIds.filter(Boolean))];
  return unique.sort((left, right) => {
    const leftIndex = YUM_BRAND_ORDER.indexOf(left);
    const rightIndex = YUM_BRAND_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export function sortYumChannels(channels = []) {
  const unique = [...new Set(channels.filter(Boolean))];
  return unique.sort((left, right) => {
    const leftIndex = YUM_CHANNEL_ORDER.indexOf(left);
    const rightIndex = YUM_CHANNEL_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export function getYumChannelLabel(channel) {
  if (YUM_CHANNEL_LABELS[channel]) {
    return YUM_CHANNEL_LABELS[channel];
  }

  return String(channel || '')
    .split('_')
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

export function getSelectedYumBrandId() {
  return window.yumSelectedBrandId || DEFAULT_YUM_BRAND_ID;
}

export function setSelectedYumBrandId(brandId, source = 'app') {
  const nextBrandId = YUM_BRAND_LABELS[brandId] ? brandId : DEFAULT_YUM_BRAND_ID;
  const priorBrandId = window.yumSelectedBrandId;
  window.yumSelectedBrandId = nextBrandId;

  if (priorBrandId !== nextBrandId || source === 'force') {
    window.dispatchEvent(
      new CustomEvent('yum-brand-change', {
        detail: {
          brandId: nextBrandId,
          source
        }
      })
    );
  }

  return nextBrandId;
}
