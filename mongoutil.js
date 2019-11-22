const { mongoDBName, mongoDBCollection } = require('./dbinfo');

// Gets the current number of users playing each song
const getCurrentSongsPlaying = (client, collectionName) => {
    return new Promise((resolve, reject) => {
        client.db(mongoDBName).collection(collectionName)
        .aggregate([
            {
                $group: {
                    _id: '$song_title',
                    total: { $sum: 1 },
                    users: { $push: '$user_id' },
                    played: { $push: '$checkOutDateTime' }
        
                }
            }
        ])
        .toArray()
        .then(result => resolve(result))
        .catch(err => reject(err))
    });
};

// Insert new entry
const newPlay = (client, collectionName, username, songTitle) => {
    return new Promise((resolve, reject) => {
        client.db(mongoDBName).collection(collectionName)
        .insertOne({
            user_id: username,
            song_title: songTitle,
            checkOutDateTime: (new Date()).getTime()
        })
        .then(result => resolve(result))
        .catch(err => reject(err))
    });
};

module.exports = { getCurrentSongsPlaying, newPlay };
