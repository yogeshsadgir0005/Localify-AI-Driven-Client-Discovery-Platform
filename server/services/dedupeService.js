const BusinessProfile = require('../models/BusinessProfile');
const ContactRequest = require('../models/ContactRequest');
const Review = require('../models/Review');
const Match = require('../models/Match');
const Event = require('../models/Event');
const trustService = require('./trustService');

/**
 * dedupeService — entity resolution for BusinessProfiles. The 11-query Places
 * fan-out and self-registration both create near-duplicates that split reviews
 * and trust across phantom records. Candidate detection is rule-based (shared
 * verified phone, or same normalised name+city); merging re-points all
 * provenance (contacts, reviews, events) onto the survivor.
 */

const digits = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Find candidate duplicate groups (each group is 2+ profiles that look like the
 * same business). Rule-based and conservative.
 */
const findDuplicates = async ({ limit = 1000 } = {}) => {
  const profiles = await BusinessProfile.find({})
    .select('name location.city contact.phone owner status verification.compositeScore reviewCount')
    .limit(limit)
    .lean();

  const groups = new Map();
  for (const p of profiles) {
    const phone = digits(p.contact?.phone);
    const key = phone.length >= 10 ? `phone:${phone}` : `namecity:${norm(p.name)}|${norm(p.location?.city)}`;
    if (!norm(p.name)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  return [...groups.entries()]
    .filter(([, ps]) => ps.length > 1)
    .map(([key, ps]) => ({
      key,
      profiles: ps.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        city: p.location?.city || '',
        claimed: !!p.owner,
        trust: p.verification?.compositeScore || 0,
        reviewCount: p.reviewCount || 0,
      })),
    }));
};

/** Recompute a surviving profile's rating aggregates from published reviews. */
const recomputeRating = async (profile) => {
  const published = await Review.find({ profile: profile._id, status: 'published' }).lean();
  profile.reviewCount = published.length;
  profile.ratingAvg = published.length
    ? Math.round((published.reduce((s, r) => s + (r.rating || 0), 0) / published.length) * 10) / 10
    : null;
};

/**
 * Merge `dropId` into `keepId`: re-point contacts, reviews, and events onto the
 * survivor, drop the loser's (regenerable) match rows, recompute trust, and
 * delete the loser.
 * @returns {Promise<{merged:boolean, keepId:string, reviewsMoved:number, contactsMoved:number}>}
 */
const mergeProfiles = async (keepId, dropId) => {
  if (String(keepId) === String(dropId)) throw new Error('keepId and dropId must differ.');
  const keep = await BusinessProfile.findById(keepId);
  const drop = await BusinessProfile.findById(dropId);
  if (!keep || !drop) throw new Error('Both profiles must exist.');

  const contactsMoved = (await ContactRequest.updateMany(
    { toProfile: drop._id },
    { $set: { toProfile: keep._id, toOwner: keep.owner || null } }
  )).modifiedCount || 0;

  const reviewsMoved = (await Review.updateMany(
    { profile: drop._id },
    { $set: { profile: keep._id } }
  )).modifiedCount || 0;

  // Matches are cheap to regenerate and carry a unique (requirement,seller)
  // index that would collide on re-point — drop them instead.
  await Match.deleteMany({ seller: drop._id });
  await Event.updateMany({ target: drop._id.toString() }, { $set: { target: keep._id.toString() } });

  // Fold the loser's report count into the survivor, then recompute.
  keep.reportCount = (keep.reportCount || 0) + (drop.reportCount || 0);
  await recomputeRating(keep);
  trustService.recompute(keep);
  await keep.save();
  await BusinessProfile.deleteOne({ _id: drop._id });

  return { merged: true, keepId: keep._id.toString(), reviewsMoved, contactsMoved };
};

module.exports = { findDuplicates, mergeProfiles };
