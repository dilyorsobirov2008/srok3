const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

const initDb = () => {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify([]));
    }
};

const getPosts = () => {
    initDb();
    const data = fs.readFileSync(dbPath, 'utf8');
    try {
        return JSON.parse(data);
    } catch(e) {
        return [];
    }
};

const savePost = (post) => {
    const posts = getPosts();
    posts.push(post);
    fs.writeFileSync(dbPath, JSON.stringify(posts, null, 2));
};

const updatePosts = (posts) => {
    fs.writeFileSync(dbPath, JSON.stringify(posts, null, 2));
};

module.exports = { getPosts, savePost, updatePosts };
