const Category = require('../models/Category');

/**
 * GET /api/categories  [public]
 * Optional ?vertical= filter. Powers the taxonomy pickers and parsing hints.
 */
const listCategories = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.vertical) filter.vertical = req.query.vertical;
    const categories = await Category.find(filter).sort({ vertical: 1, slug: 1 }).lean();
    const verticals = [...new Set(categories.map((c) => c.vertical))];
    return res.json({ success: true, verticals, categories });
  } catch (err) {
    return next(err);
  }
};

module.exports = { listCategories };
