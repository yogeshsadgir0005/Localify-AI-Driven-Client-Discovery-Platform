const Notification = require('../models/Notification');
const BusinessProfile = require('../models/BusinessProfile');
const User = require('../models/User');

/**
 * notificationService — creates in-app notifications (pull-only; TRAI-safe).
 * Respects consent: if a user has explicitly withdrawn the 'match_alerts'
 * purpose, alert-type notifications are skipped. Direct transactional
 * notifications (your contact was revealed) are always delivered.
 */

const ALERT_TYPES = new Set(['new_matching_requirement', 'saved_search_match']);

const alertsAllowed = async (userId) => {
  try {
    const user = await User.findById(userId).select('consents').lean();
    const c = (user?.consents || []).find((x) => x.purpose === 'match_alerts');
    // Default allow unless explicitly withdrawn.
    return !c || c.granted !== false;
  } catch {
    return true;
  }
};

/** Create one notification, honouring consent for alert-type notifications. */
const notify = async (userId, payload) => {
  if (!userId) return null;
  try {
    if (ALERT_TYPES.has(payload.type) && !(await alertsAllowed(userId))) return null;
    return await Notification.create({ user: userId, ...payload });
  } catch (err) {
    console.error('[notify] failed:', err.message);
    return null;
  }
};

/**
 * Alert the (claimed) sellers in a shortlist that a buyer is looking for what
 * they offer — the demand→supply half of the alert flywheel.
 * @param {object} requirement
 * @param {Array}  matches  the summarised match objects from matchingService
 */
const notifyMatchingSellers = async (requirement, matches) => {
  const ids = (matches || []).filter((m) => m.profile?.claimed).map((m) => m.profile.id);
  if (!ids.length) return;
  try {
    const profiles = await BusinessProfile.find({
      _id: { $in: ids },
      owner: { $ne: null },
    })
      .select('owner name')
      .lean();
    const seen = new Set();
    await Promise.all(
      profiles.map((p) => {
        const owner = p.owner.toString();
        // Don't notify the buyer about their own profile.
        if (owner === requirement.buyer.toString() || seen.has(owner)) return null;
        seen.add(owner);
        return notify(owner, {
          type: 'new_matching_requirement',
          title: 'A buyer is looking for what you offer',
          body: (requirement.rawText || '').slice(0, 160),
          data: { requirementId: requirement._id.toString(), profileId: p._id.toString() },
        });
      })
    );
  } catch (err) {
    console.error('[notify] notifyMatchingSellers failed:', err.message);
  }
};

module.exports = { notify, notifyMatchingSellers };
