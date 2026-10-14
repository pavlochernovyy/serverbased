// First-run seed data for all three stores, kept in one place so the cross-references stay in
// sync: comment "c1" points at post "p1", like "l1" is a post-level like on "p1", like "l2" is on
// comment "c1" — and the denormalized counts on post "p1"/comment "c1" match those entries.
const postSeeds = [
  [
    'p1',
    {
      title: 'first post',
      body: 'hello, blog',
      author: 'pavlo',
      createdAt: '2026-09-01T00:00:00.000Z',
      commentsCount: 1,
      likesCount: 1,
    },
  ],
];

const commentSeeds = [
  [
    'c1',
    { postId: 'p1', body: 'first comment', author: 'pavlo', createdAt: '2026-09-01T00:00:00.000Z', likesCount: 1 },
  ],
];

const likeSeeds = [
  ['l1', { postId: 'p1', commentId: null, createdAt: '2026-09-01T00:00:00.000Z' }],
  ['l2', { postId: 'p1', commentId: 'c1', createdAt: '2026-09-01T00:00:00.000Z' }],
];

module.exports = { postSeeds, commentSeeds, likeSeeds };
