/**
 * Segmentation Engine Module
 * Core logic for customer segmentation, elasticity calculation with fallbacks, and KPI aggregation
 *
 * Dependencies: D3.js (for CSV/JSON loading)
 */

class SegmentationEngine {
    constructor() {
        this.segmentElasticity = null;
        this.customerSegments = null;
        this.segmentKPIs = null;
        this.cohortCoefficients = null;
        this.activeCohort = 'baseline';

        // Strategic segment axis definitions (based on customer personas)
        this.axisDefinitions = {
            acquisition: [
                'seasonal_first_time',
                'routine_refill',
                'gift_buyer',
                'influencer_discovered',
                'promo_triggered'
            ],
            engagement: [
                'prestige_loyalist',
                'value_seeker',
                'deal_hunter',
                'occasional_shop',
                'channel_switcher'
            ],
            monetization: [
                'single_sku_staple',
                'multi_sku_builder',
                'value_bundle_buyer',
                'premium_add_on',
                'trial_size_sampler'
            ]
        };

        // Axis labels for display (retail / seasonal brand framing)
        this.axisLabels = {
            acquisition: 'Acquisition & Price Sensitivity',
            engagement: 'Loyalty & Repeat Risk',
            monetization: 'Basket Value & Kit Depth'
        };

        // Segment descriptions and characteristics
        this.segmentDescriptions = {
            // Axis 3: Acquisition Price Sensitivity
            'seasonal_first_time': {
                label: 'Seasonal First-Time',
                description: 'First purchase driven by seasonal need',
                elasticity_level: 'High price sensitivity'
            },
            'routine_refill': {
                label: 'Routine Refill',
                description: 'Repeat replenishment with stable cadence',
                elasticity_level: 'Low price sensitivity'
            },
            'gift_buyer': {
                label: 'Gift Buyer',
                description: 'Purchases tied to gifting occasions',
                elasticity_level: 'Medium price sensitivity'
            },
            'influencer_discovered': {
                label: 'Influencer Discovered',
                description: 'Social-led discovery with spikes',
                elasticity_level: 'High promo response'
            },
            'promo_triggered': {
                label: 'Promo Triggered',
                description: 'Entry only when discounts are visible',
                elasticity_level: 'Very high price sensitivity'
            },

            // Axis 2: Repeat Behavior
            'prestige_loyalist': {
                label: 'Prestige Loyalist',
                description: 'High repeat rate in prestige channel',
                elasticity_level: 'Low repeat-loss elasticity'
            },
            'value_seeker': {
                label: 'Value Seeker',
                description: 'Responds to moderate discounts',
                elasticity_level: 'Medium repeat-loss elasticity'
            },
            'deal_hunter': {
                label: 'Deal Hunter',
                description: 'Heavy promo reliance, low loyalty',
                elasticity_level: 'High repeat-loss elasticity'
            },
            'occasional_shop': {
                label: 'Occasional Shopper',
                description: 'Low frequency, low engagement',
                elasticity_level: 'Medium-high repeat-loss elasticity'
            },
            'channel_switcher': {
                label: 'Channel Switcher',
                description: 'Shifts between mass and prestige',
                elasticity_level: 'Migration elasticity critical'
            },

            // Axis 1: Basket Value & Mix
            'single_sku_staple': {
                label: 'Single-SKU Staple',
                description: 'Repeat purchase of a hero SKU',
                elasticity_level: 'Moderate price sensitivity'
            },
            'multi_sku_builder': {
                label: 'Multi-SKU Builder',
                description: 'Builds larger baskets with variety',
                elasticity_level: 'Lower price sensitivity'
            },
            'value_bundle_buyer': {
                label: 'Value Bundle Buyer',
                description: 'Prefers sets and value packs',
                elasticity_level: 'Medium price sensitivity'
            },
            'premium_add_on': {
                label: 'Premium Add-On',
                description: 'Adds premium or limited SKUs',
                elasticity_level: 'Low price sensitivity'
            },
            'trial_size_sampler': {
                label: 'Trial-Size Sampler',
                description: 'Tests mini sizes and entry packs',
                elasticity_level: 'High price sensitivity'
            }
        };
    }

    /**
     * Load all segment data files
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    async loadSegmentData() {
        try {
            const [elasticity, segments, kpis, cohorts] = await Promise.all([
                d3.json('data/segment_elasticity.json'),
                d3.csv('data/segments.csv'),
                d3.csv('data/segment_kpis.csv'),
                d3.json('data/cohort_coefficients.json')
            ]);

            this.segmentElasticity = elasticity;
            this.customerSegments = segments.map(row => ({
                customer_id: row.customer_id,
                tier: row.channel_group === 'mass' ? 'ad_supported' : 'ad_free',
                acquisition_segment: row.acquisition_segment,
                engagement_segment: row.engagement_segment,
                monetization_segment: row.monetization_segment,
                composite_key: row.segment_key
            }));
            this.segmentKPIs = this.#indexKPIsByCompositeKey(kpis.map(kpi => ({
                composite_key: kpi.segment_key,
                tier: kpi.channel_group === 'mass' ? 'ad_supported' : 'ad_free',
                customer_count: kpi.customer_count,
                repeat_loss_rate: kpi.repeat_loss_rate,
                avg_order_value: kpi.avg_order_value,
                avg_units_per_order: kpi.avg_units_per_order,
                avg_cac: kpi.avg_cac,
                promo_redemption_rate: kpi.promo_redemption_rate,
                margin_rate: kpi.margin_rate
            })));
            this.cohortCoefficients = cohorts;

            return true;
        } catch (error) {
            console.error('Failed to load segment data:', error);
            return false;
        }
    }

    /**
     * Get elasticity with 4-level fallback strategy
     * @param {string} tier - Subscription tier (ad_supported, ad_free)
     * @param {string} compositeKey - Segment composite key "tenure|age|device"
     * @param {string} axis - Axis name ('engagement', 'monetization', 'acquisition')
     * @returns {number} Elasticity value
     */
    getElasticity(tier, compositeKey, axis = null) {
        try {
            // Validate inputs
            if (!tier || !compositeKey) {
                console.warn('Invalid parameters for elasticity lookup:', { tier, compositeKey });
                return this.#getBaseFallback(tier);
            }

            // Check if data is loaded
            if (!this.segmentElasticity) {
                console.warn('Segment elasticity data not loaded');
                return this.#getBaseFallback(tier);
            }

            const tierData = this.segmentElasticity[tier];
            if (!tierData) {
                console.warn(`No elasticity data for tier: ${tier}`);
                return this.#getBaseFallback(tier);
            }

            // Level 1: 3-axis segment lookup
            const segmentData = tierData.segment_elasticity?.[compositeKey];

            if (segmentData && axis) {
                // Map UI axis names to JSON axis keys
                // UI uses: 'acquisition', 'engagement', 'monetization'
                // JSON has: 'acquisition_axis', 'repeat_loss_axis', 'migration_axis'
                const axisMapping = {
                    'acquisition': 'acquisition_axis',
                    'engagement': 'repeat_loss_axis',  // Engagement relates to churn behavior
                    'monetization': 'migration_axis'  // Monetization relates to tier migration
                };

                const axisKey = axisMapping[axis] || `${axis}_axis`;
                const axisData = segmentData[axisKey];

                if (axisData && axisData.elasticity !== undefined) {
                    const multipliers = this.#getCohortMultipliers();

                    // Apply the CORRECT multiplier based on axis type
                    let appliedMultiplier = 1;
                    if (axis === 'acquisition') {
                        // Use acquisition elasticity multiplier
                        appliedMultiplier = multipliers?.acquisition_elasticity || 1;
                    } else if (axis === 'engagement') {
                        // Use repeat-loss elasticity multiplier (engagement = repeat-loss propensity)
                        appliedMultiplier = multipliers?.repeat_loss || 1;
                    } else if (axis === 'monetization') {
                        // Use migration asymmetry multiplier (monetization = tier switching)
                        appliedMultiplier = multipliers?.migration_asymmetry || 1;
                    }

                    const segmentElasticity = axisData.elasticity * appliedMultiplier;
                    return segmentElasticity;
                }

                console.warn('⚠️ Axis data not found, using fallback:', {
                    tier,
                    axis,
                    axisKey,
                    compositeKey: compositeKey.substring(0, 50) + '...',
                    hasSegmentData: !!segmentData,
                    availableKeys: segmentData ? Object.keys(segmentData) : []
                });
            }

            // Level 2-4: Fallback to existing elasticity calculation
            // This integrates with the existing elasticity-model.js
            const baseElasticity = this.#getBaseFallback(tier);
            const multipliers = this.#getCohortMultipliers();
            // For fallback, assume acquisition context (most common)
            return baseElasticity * (multipliers?.acquisition_elasticity || 1);
        } catch (error) {
            console.error('Error getting elasticity:', error);
            const baseElasticity = this.#getBaseFallback(tier);
            const multipliers = this.#getCohortMultipliers();
            // For fallback, assume acquisition context (most common)
            return baseElasticity * (multipliers?.acquisition_elasticity || 1);
        }
    }

    /**
     * Get complete segment data for a composite key
     * @param {string} compositeKey - Segment composite key
     * @param {string} tier - Subscription tier
     * @returns {Object|null} Segment data with all axis values
     */
    getSegmentData(compositeKey, tier) {
        if (!this.segmentElasticity || !tier) return null;

        const tierData = this.segmentElasticity[tier];
        if (!tierData) return null;

        const segmentData = tierData.segment_elasticity?.[compositeKey];
        if (!segmentData) return null;

        return this.#applyCohortToSegmentData(segmentData);
    }

    /**
     * Filter segments by axis values
     * @param {Object} filters - { acquisition: [], engagement: [], monetization: [] }
     * @returns {Array<Object>} Filtered segment data with KPIs
     */
    filterSegments(filters = {}) {
        if (!this.segmentKPIs) {
            console.warn('Segment KPIs not loaded');
            return [];
        }

        const results = [];

        for (const [indexKey, kpis] of Object.entries(this.segmentKPIs)) {
            // Index key format is: tier|acquisition|engagement|monetization
            const parts = indexKey.split('|');
            const tier = parts[0];
            const compositeKey = parts.slice(1).join('|');
            const [acquisition, engagement, monetization] = parts.slice(1);

            // Check if segment matches all active filters
            const matchesAcquisition = !filters.acquisition?.length ||
                                      filters.acquisition.includes(acquisition);
            const matchesEngagement = !filters.engagement?.length ||
                                     filters.engagement.includes(engagement);
            const matchesMonetization = !filters.monetization?.length ||
                                       filters.monetization.includes(monetization);

            if (matchesAcquisition && matchesEngagement && matchesMonetization) {
                const adjustedKPIs = this.#applyCohortToKPIs(kpis);
                results.push({
                    compositeKey,
                    acquisition,
                    engagement,
                    monetization,
                    tier,
                    ...adjustedKPIs
                });
            }
        }

        return results;
    }

    /**
     * Aggregate KPIs across segments (weighted by customer count)
     * @param {Array<Object>} segments - Filtered segments
     * @returns {Object} Aggregated metrics
     */
    aggregateKPIs(segments) {
        if (!segments || segments.length === 0) {
            return {
                total_customers: 0,
                weighted_repeat_loss: 0,
                weighted_aov: 0,
                weighted_units: 0,
                weighted_cac: 0,
                weighted_promo_redemption: 0,
                weighted_margin: 0,
                segment_count: 0
            };
        }

        const totalSubs = segments.reduce((sum, s) => {
            return sum + parseFloat(s.customer_count || 0);
        }, 0);

        if (totalSubs === 0) {
            return {
                total_customers: 0,
                weighted_repeat_loss: 0,
                weighted_aov: 0,
                weighted_units: 0,
                weighted_cac: 0,
                weighted_promo_redemption: 0,
                weighted_margin: 0,
                segment_count: segments.length
            };
        }

        return {
            total_customers: Math.round(totalSubs),
            weighted_repeat_loss: this.#weightedAvg(segments, 'repeat_loss_rate', 'customer_count'),
            weighted_aov: this.#weightedAvg(segments, 'avg_order_value', 'customer_count'),
            weighted_units: this.#weightedAvg(segments, 'avg_units_per_order', 'customer_count'),
            weighted_cac: this.#weightedAvg(segments, 'avg_cac', 'customer_count'),
            weighted_promo_redemption: this.#weightedAvg(segments, 'promo_redemption_rate', 'customer_count'),
            weighted_margin: this.#weightedAvg(segments, 'margin_rate', 'customer_count'),
            segment_count: segments.length
        };
    }

    /**
     * Get all segments for a specific tier
     * @param {string} tier - Tier name
     * @returns {Array<Object>} Segments with KPIs for that tier
     */
    getSegmentsForTier(tier) {
        if (!this.segmentKPIs) return [];

        return Object.entries(this.segmentKPIs)
            .filter(([indexKey, _]) => indexKey.startsWith(tier + '|'))
            .map(([indexKey, kpis]) => {
                // Index key format is: tier|acquisition|engagement|monetization
                const parts = indexKey.split('|');
                const compositeKey = parts.slice(1).join('|');
                const [acquisition, engagement, monetization] = parts.slice(1);
                const adjustedKPIs = this.#applyCohortToKPIs(kpis);
                return {
                    compositeKey,
                    acquisition,
                    engagement,
                    monetization,
                    tier,
                    ...adjustedKPIs
                };
            });
    }

    /**
     * Get available cohort definitions
     * @returns {Array<Object>} Cohort list with id, label, description
     */
    getCohortDefinitions() {
        if (!this.cohortCoefficients) return [];

        const cohorts = Object.entries(this.cohortCoefficients)
            .filter(([id]) => id !== 'metadata')  // Exclude metadata key
            .map(([id, data]) => ({
                id,
                label: data.label,
                description: data.description || ''
            }));

        // Sort to put baseline first
        return cohorts.sort((a, b) => {
            if (a.id === 'baseline') return -1;
            if (b.id === 'baseline') return 1;
            return 0;
        });
    }

    /**
     * Set active cohort for calculations
     * @param {string} cohortId - Cohort identifier
     */
    setActiveCohort(cohortId) {
        if (!cohortId || !this.cohortCoefficients) return;
        if (!this.cohortCoefficients[cohortId]) {
            console.warn(`Unknown cohort: ${cohortId}`);
            return;
        }
        this.activeCohort = cohortId;
    }

    /**
     * Get active cohort id
     * @returns {string}
     */
    getActiveCohort() {
        return this.activeCohort || 'baseline';
    }

    /**
     * Get formatted label for a segment value
     * @param {string} value - Segment value
     * @returns {string} Formatted label
     */
    formatSegmentLabel(value) {
        if (this.segmentDescriptions[value]) {
            return this.segmentDescriptions[value].label;
        }
        return value;
    }

    /**
     * Get full segment information
     * @param {string} value - Segment value
     * @returns {Object|null} Segment info with label, description, elasticity_level
     */
    getSegmentInfo(value) {
        return this.segmentDescriptions[value] || null;
    }

    /**
     * Generate a single-line summary for a segment based on its composite key and metrics
     * @param {string} compositeKey - "acquisition|engagement|monetization"
     * @param {Object} metrics - { customer_count, repeat_loss_rate, avg_order_value }
     * @returns {string} Single-line description
     */
    generateSegmentSummary(compositeKey, metrics) {
        const [acquisition, engagement, monetization] = compositeKey.split('|');

        // Get segment info
        const acqInfo = this.segmentDescriptions[acquisition];
        const engInfo = this.segmentDescriptions[engagement];
        const monInfo = this.segmentDescriptions[monetization];

        // Determine key characteristics
        const repeatLoss = parseFloat(metrics.repeat_loss_rate) || 0;
        const avgOrderValue = parseFloat(metrics.avg_order_value) || 0;
        const customers = parseInt(metrics.customer_count) || 0;

        // Size descriptor
        const sizeDesc = customers > 2000 ? 'Large' : customers > 1000 ? 'Medium-sized' : 'Small';

        // Churn risk level
        const repeatRisk = repeatLoss > 0.18 ? 'very high repeat-loss risk' :
                         repeatLoss > 0.14 ? 'high repeat-loss risk' :
                         repeatLoss > 0.10 ? 'moderate repeat risk' : 'stable repeat rate';

        // Value tier
        const valueTier = avgOrderValue > 45 ? 'premium' : avgOrderValue > 32 ? 'mid-tier' : 'value-focused';

        // Price sensitivity from elasticity info
        const priceSensitivity = engInfo?.elasticity_level?.toLowerCase() || 'moderate price sensitivity';

        // Build smart summary based on most notable characteristic
        let summary = '';

        // Priority 1: High churn segments (biggest risk)
        if (repeatLoss > 0.15) {
            summary = `${sizeDesc} ${valueTier} segment with ${repeatRisk} - requires repeat focus`;
        }
        // Priority 2: High-value stable segments (revenue drivers)
        else if (avgOrderValue > 40 && repeatLoss < 0.10) {
            summary = `${sizeDesc} high-value segment with strong repeat - key revenue driver`;
        }
        // Priority 3: Large segments (volume plays)
        else if (customers > 2000) {
            summary = `Large ${valueTier} segment with ${repeatRisk} - ${priceSensitivity}`;
        }
        // Priority 4: Small high-value segments (niche opportunities)
        else if (avgOrderValue > 40) {
            summary = `Small premium segment with ${repeatRisk} - niche opportunity`;
        }
        // Priority 5: Everyone else
        else {
            summary = `${sizeDesc} ${valueTier} segment - ${priceSensitivity} with ${repeatRisk}`;
        }

        return summary;
    }

    /**
     * Format composite key to human-readable label
     * @param {string} compositeKey - "acquisition|engagement|monetization"
     * @returns {string} Formatted label with separators
     */
    formatCompositeKey(compositeKey) {
        const [acquisition, engagement, monetization] = compositeKey.split('|');
        return `${this.formatSegmentLabel(acquisition)} | ${this.formatSegmentLabel(engagement)} | ${this.formatSegmentLabel(monetization)}`;
    }

    /**
     * Parse composite key into components
     * @param {string} compositeKey - "acquisition|engagement|monetization"
     * @returns {Object} { acquisition, engagement, monetization }
     */
    parseCompositeKey(compositeKey) {
        const [acquisition, engagement, monetization] = compositeKey.split('|');
        return { acquisition, engagement, monetization };
    }

    /**
     * Check if segment data is available
     * @returns {boolean}
     */
    isDataLoaded() {
        return !!(this.segmentElasticity && this.customerSegments && this.segmentKPIs);
    }

    // ========== Private Helper Methods ==========

    /**
     * Index KPIs by composite key AND tier for fast lookup
     * @private
     */
    #indexKPIsByCompositeKey(kpis) {
        const index = {};
        kpis.forEach(kpi => {
            // Use both tier and composite_key as the index to avoid overwriting
            const indexKey = `${kpi.tier}|${kpi.composite_key}`;
            index[indexKey] = kpi;
        });
        return index;
    }

    /**
     * Calculate weighted average
     * @private
     */
    #weightedAvg(segments, metric, weight) {
        const totalWeight = segments.reduce((sum, s) => {
            return sum + parseFloat(s[weight] || 0);
        }, 0);

        if (totalWeight === 0) return 0;

        const weightedSum = segments.reduce((sum, s) => {
            const metricValue = parseFloat(s[metric] || 0);
            const weightValue = parseFloat(s[weight] || 0);
            return sum + (metricValue * weightValue);
        }, 0);

        return weightedSum / totalWeight;
    }

    /**
     * Get base tier elasticity fallback
     * @private
     */
    #getBaseFallback(tier) {
        const baseFallbacks = {
            'ad_supported': -2.1,
            'ad_free': -1.5
        };
        return baseFallbacks[tier] || -1.7;
    }

    /**
     * Get cohort multipliers (dynamically calculated from coefficients)
     * @private
     */
    #getCohortMultipliers() {
        if (!this.cohortCoefficients) return null;

        const activeCohortId = this.getActiveCohort();
        const cohort = this.cohortCoefficients[activeCohortId];
        const baseline = this.cohortCoefficients['baseline'];

        if (!cohort || !baseline) return null;

        // If baseline is selected, no adjustments needed
        if (activeCohortId === 'baseline') {
            return {
                repeat_loss: 1.0,
                aov: 1.0,
                units_per_order: 1.0,
                cac: 1.0,
                customer_count: 1.0,
                acquisition_elasticity: 1.0,
                migration_asymmetry: 1.0
            };
        }

        // Calculate multipliers as ratios relative to baseline
        const multipliers = {
            // Repeat loss: ratio of repeat-loss elasticity
            repeat_loss: cohort.repeat_loss_elasticity / baseline.repeat_loss_elasticity,

            // AOV: infer from engagement and tier preference
            // Using migration_upgrade as proxy: higher upgrade willingness = higher AOV preference
            aov: 0.8 + (cohort.migration_upgrade * 0.3),

            // Units per order: based on engagement_offset
            units_per_order: 1.0 + cohort.engagement_offset,

            // CAC: Deal hunters and promo-sensitive have lower CAC (come from cheaper channels)
            // Using migration_downgrade as proxy: higher downgrade = more price-sensitive = lower CAC
            cac: Math.max(0.5, 1.5 - (cohort.migration_downgrade * 0.3)),

            // Customer count: don't adjust population distribution
            customer_count: 1.0,

            // Acquisition Elasticity: ratio of acquisition elasticity (price sensitivity for NEW customers)
            acquisition_elasticity: Math.abs(cohort.acquisition_elasticity) / Math.abs(baseline.acquisition_elasticity),

            // Migration Asymmetry: ratio of migration asymmetry factor (tier switching propensity)
            migration_asymmetry: cohort.migration_asymmetry_factor / baseline.migration_asymmetry_factor
        };

        return multipliers;
    }

    /**
     * Apply cohort multipliers to axis data
     * @private
     */
    #applyCohortToAxis(axisData) {
        const multipliers = this.#getCohortMultipliers();
        if (!multipliers || !axisData) return axisData;

        const adjusted = { ...axisData };
        if (typeof adjusted.elasticity === 'number') {
            adjusted.elasticity = adjusted.elasticity * multipliers.elasticity;
        }
        if (typeof adjusted.repeat_loss_rate === 'number') {
            adjusted.repeat_loss_rate = Math.min(1, Math.max(0, adjusted.repeat_loss_rate * multipliers.repeat_loss));
        }
        if (typeof adjusted.aov === 'number') {
            adjusted.aov = adjusted.aov * multipliers.aov;
        }
        if (typeof adjusted.cac_sensitivity === 'number') {
            adjusted.cac_sensitivity = adjusted.cac_sensitivity * multipliers.cac_sensitivity;
        }
        if (typeof adjusted.watch_hours === 'number') {
            adjusted.watch_hours = adjusted.watch_hours * multipliers.units_per_order;
        }
        return adjusted;
    }

    /**
     * Apply cohort multipliers to segment axis data
     * @private
     */
    #applyCohortToSegmentData(segmentData) {
        const adjusted = { ...segmentData };
        if (segmentData.acquisition_axis) {
            adjusted.acquisition_axis = this.#applyCohortToAxis(segmentData.acquisition_axis);
        }
        if (segmentData.engagement_axis) {
            adjusted.engagement_axis = this.#applyCohortToAxis(segmentData.engagement_axis);
        }
        if (segmentData.monetization_axis) {
            adjusted.monetization_axis = this.#applyCohortToAxis(segmentData.monetization_axis);
        }
        return adjusted;
    }

    /**
     * Apply cohort multipliers to KPI values
     * @private
     */
    #applyCohortToKPIs(kpis) {
        const multipliers = this.#getCohortMultipliers();

        // If no multipliers or no KPIs, return original
        if (!multipliers || !kpis) return kpis;

        const original = { ...kpis };
        const adjusted = { ...kpis };

        if (adjusted.repeat_loss_rate !== undefined) {
            adjusted.repeat_loss_rate = Math.min(1, Math.max(0, parseFloat(adjusted.repeat_loss_rate) * multipliers.repeat_loss));
        }
        if (adjusted.avg_order_value !== undefined) {
            adjusted.avg_order_value = parseFloat(adjusted.avg_order_value) * multipliers.aov;
        }
        if (adjusted.avg_units_per_order !== undefined) {
            adjusted.avg_units_per_order = parseFloat(adjusted.avg_units_per_order) * multipliers.units_per_order;
        }
        if (adjusted.avg_cac !== undefined) {
            adjusted.avg_cac = parseFloat(adjusted.avg_cac) * multipliers.cac;
        }
        if(adjusted.customer_count !== undefined && multipliers.customer_count !== undefined) {
            adjusted.customer_count = Math.round(parseFloat(adjusted.customer_count) * multipliers.customer_count);
        }

        return adjusted;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.segmentEngine = new SegmentationEngine();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentationEngine;
}
