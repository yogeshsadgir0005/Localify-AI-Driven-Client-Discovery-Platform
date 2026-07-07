const Notification = require('../models/Notification');

/** GET /api/notifications  [protected] — the user's notifications (newest first). */
const listNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const unread = notifications.filter((n) => !n.read).length;
    return res.json({ success: true, unread, notifications });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/notifications/:id/read  [protected] */
const markRead = async (req, res, next) => {
  try {
    const result = await Notification.updateOne(
      { _id: req.params.id, user: req.user.id },
      { $set: { read: true } }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/notifications/read-all  [protected] */
const markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user.id, read: false }, { $set: { read: true } });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

module.exports = { listNotifications, markRead, markAllRead };
