/**
 * Cohort Aggregator Module
 * Aggregates 250 customer segments into cohorts for model predictions
 */

/**
 * Aggregate segments into acquisition cohorts
 * Groups by acquisition_segment (5 cohorts)
 */
export async function getAcquisitionCohorts(tier) {
  try {
    // Load segment data
    const segmentKPIs = await loadSegmentKPIs();
    const segmentElasticity = await loadSegmentElasticity();

    // Define acquisition segment types
    const acquisitionSegments = [
      'seasonal_first_time',
      'routine_refill',
      'gift_buyer',
      'influencer_discovered',
      'promo_triggered'
    ];

    const cohorts = [];

    for (const segmentType of acquisitionSegments) {
      // Filter segments for this cohort and tier
      const cohortSegments = segmentKPIs.filter(s => {
        const compositeKey = s.composite_key;
        const [acq, eng, mon] = compositeKey.split('|');
        return acq === segmentType && s.tier === tier;
      });

      if (cohortSegments.length === 0) continue;

      // Calculate cohort size (sum of customer counts)
      const size = cohortSegments.reduce((sum, s) => sum + parseInt(s.customer_count), 0);

      // Calculate average elasticity for acquisition axis
      let elasticitySum = 0;
      let elasticityCount = 0;

      for (const segment of cohortSegments) {
        const elasticityData = segmentElasticity[tier]?.segment_elasticity?.[segment.composite_key];
        if (elasticityData?.acquisition_axis?.elasticity) {
          elasticitySum += elasticityData.acquisition_axis.elasticity;
          elasticityCount++;
        }
      }

      const avgElasticity = elasticityCount > 0 ? elasticitySum / elasticityCount : -1.8;

      // Friendly name mapping
      const nameMap = {
        'seasonal_first_time': 'Seasonal First-Time',
        'routine_refill': 'Routine Refill',
        'gift_buyer': 'Gift Buyer',
        'influencer_discovered': 'Influencer Discovered',
        'promo_triggered': 'Promo Triggered'
      };

      cohorts.push({
        name: nameMap[segmentType] || segmentType,
        size: size,
        elasticity: avgElasticity
      });
    }

    return cohorts;
  } catch (error) {
    console.error('Error aggregating acquisition cohorts:', error);
    return [];
  }
}

/**
 * Aggregate segments into churn cohorts
 * Groups by engagement_segment (5 cohorts)
 */
export async function getChurnCohorts(tier) {
  try {
    const segmentKPIs = await loadSegmentKPIs();
    const segmentElasticity = await loadSegmentElasticity();

    const engagementSegments = [
      'prestige_loyalist',
      'value_seeker',
      'deal_hunter',
      'occasional_shop',
      'channel_switcher'
    ];

    const cohorts = [];

    for (const segmentType of engagementSegments) {
      const cohortSegments = segmentKPIs.filter(s => {
        const compositeKey = s.composite_key;
        const [acq, eng, mon] = compositeKey.split('|');
        return eng === segmentType && s.tier === tier;
      });

      if (cohortSegments.length === 0) continue;

      const size = cohortSegments.reduce((sum, s) => sum + parseInt(s.customer_count), 0);

      let elasticitySum = 0;
      let elasticityCount = 0;

      for (const segment of cohortSegments) {
        const elasticityData = segmentElasticity[tier]?.segment_elasticity?.[segment.composite_key];
        if (elasticityData?.engagement_axis?.elasticity) {
          elasticitySum += elasticityData.engagement_axis.elasticity;
          elasticityCount++;
        }
      }

      const avgElasticity = elasticityCount > 0 ? elasticitySum / elasticityCount : -2.1;

      const nameMap = {
        'prestige_loyalist': 'Prestige Loyalist',
        'value_seeker': 'Value Seeker',
        'deal_hunter': 'Deal Hunter',
        'occasional_shop': 'Occasional Shopper',
        'channel_switcher': 'Channel Switcher'
      };

      cohorts.push({
        name: nameMap[segmentType] || segmentType,
        size: size,
        elasticity: avgElasticity
      });
    }

    return cohorts;
  } catch (error) {
    console.error('Error aggregating churn cohorts:', error);
    return [];
  }
}

/**
 * Load segment KPIs from CSV
 */
async function loadSegmentKPIs() {
  const response = await fetch('data/segment_kpis.csv');
  const text = await response.text();

  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i];
    });
    return {
      composite_key: obj.segment_key,
      tier: obj.channel_group === 'mass' ? 'ad_supported' : 'ad_free',
      customer_count: obj.customer_count,
      repeat_loss_rate: obj.repeat_loss_rate,
      avg_order_value: obj.avg_order_value,
      avg_units_per_order: obj.avg_units_per_order,
      avg_cac: obj.avg_cac
    };
  });
}

/**
 * Load segment elasticity from JSON
 */
async function loadSegmentElasticity() {
  const response = await fetch('data/segment_elasticity.json');
  return await response.json();
}
