// Load the libraries
const fs = require('fs');
const morgan = require('morgan');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const express = require('express');
// const hbs = require('express-handlebars');
// const moment = require('moment');
// const request = require('request-promise');

// Country list library
const countryList = require('iso-3166-country-list');

// Refactored functions for MySQL queries/transactions
const db = require('./dbutil');

// Refactored functions for mongoDB queries
const dbmongo = require('./mongoutil');

// Config file
const config = require('./productionConfig');

// Functions to initialize databases
const { loadConfig, testConnections } = require('./initdb');

// Load databases info and settings
const { DO_SPACE_URL,bucketName, bucketFolderName,
		mongoDBName, mongoDBCollection } = require('./dbinfo');

// Load mysql, s3 and mongodb connections as pool, s3 and atlasClient
const { mysql: pool, s3, mongodb: atlasClient } = loadConfig(config);


// MySQl query phrases
const qp_CHECK_USER = 'select * from users where username = ?';
const qp_ADD_SONG = 'insert into song_info(song_title, lyrics, num_listening_slots, country, song_file_name) values (?, ?, ?, ?, ?)';
const qp_GET_ALL_SONGS = 'select song_title as title, country, num_listening_slots as listen_slots from song_info';
const qp_GET_SONG = 'select * from song_info where song_title = ?';

// MySQl query functions
const checkUser = db.mkQueryFromPool(db.mkQuery(qp_CHECK_USER), pool);
const addSong = db.mkQueryFromPool(db.mkQuery(qp_ADD_SONG), pool);
const getAllSongs = db.mkQueryFromPool(db.mkQuery(qp_GET_ALL_SONGS), pool);
const getSong = db.mkQueryFromPool(db.mkQuery(qp_GET_SONG), pool);

// Multer
// Uses the tmp directory to temporarily store folders
const upload = multer({ dest: path.join(__dirname, '/tmp/') });

// Port
const PORT = parseInt(process.argv[2] || process.env.APP_PORT || process.env.PORT) || 3000;

// Start the application
const app = express();

// // Handlebars
// app.engine('hbs', hbs({ defaultLayout: 'main.hbs' }));
// app.set('view engine', 'hbs');
// app.set('views', path.join(__dirname, 'views'));

// CORS and Morgan
app.use(cors());
app.use(morgan('tiny'));

// Handle requests here

// Upload a music file
app.post('/api/upload', upload.single('musicfile'),
    (req, res, next) => {
        // On response sent, delete the file uploaded by user
        // Accounts for all cases in one place
        res.on('finish', () => {
            // If request handled is a single file upload
            if (req.file.path) {
                fs.unlink(req.file.path, err => {});
            }
        })
        // Gets the username to authenticate
        const username = req.body.username;
        if (!username)
            return res.status(400).json({ status: 'No user entered!' })
        // Check if the uploader/user exists
        // If the uploader/user does not exist, return 403
        checkUser([ username ])
            .then(result => {
                if (result.length) {
                    return next();
                }
                // If code here can be reached, means user does not exist
                // result = [];
                res.status(403).json({ status: 'User does not exist!' });
            })
            .catch(err => {
                res.status(500).json({ status: 'Internal server error!', err });
            });
    },

    (req, res) => {
        // Get info from file
        // song_title, lyrics, num_listening_slots, country, song_file_name
        const formInfo = req.body;
        const songInfoArray = [ formInfo.song_name, formInfo.lyrics, parseInt(formInfo.listen_slots), formInfo.country, req.file.filename]

		// Upload music file to s3
		new Promise((resolve, reject) => {
			fs.readFile(req.file.path, (err, musicFile) => {
				if (err) {
					return reject(err);
				}
				// Config: public can access
				const params = {
					Bucket: bucketName,
					Key: `${bucketFolderName}/${req.file.filename}`,
					Body: musicFile,
					ACL: 'public-read',
					ContentType: req.file.mimetype,
					ContentLength: req.file.size,
					Metadata: {
						originalName: req.file.originalname,
						update: '' + (new Date()).getTime()
					}
				};
				s3.putObject(params, (error, result) => {
					if (error) {
						return reject(error);
					}
					resolve();
				})
			})	
		})
		// Add entry into mongoDB 
		.then(() => {
			return (
                addSong(songInfoArray)
			);
		})
		.then(result => {
            console.log(`File access is: https://${bucketName}.${DO_SPACE_URL}/${bucketFolderName}/${req.file.filename}`)
			return res.status(201).json({ status: 'File uploaded!' });
		})
		.catch(err => {
			return res.status(500).json({ status: 'Internal server error!', err });
		});
    }
)

// Get a list of all songs with its information
app.get('/api/songs/all', (req, res) => {
    getAllSongs()
    .then((results) => {
        // Initialize song array
        const songArray = [];
        // Map the results
        results.map(v => {
            songArray.push({
                title: v.title,
                country: v.country,
                countryCode: countryList.code(v.country).toLowerCase(),
                listen_slots: v.listen_slots,
                // !!! TODO
                checked_out: 5
            })
        })
        console.log('>>> song array: ', songArray);
        res.status(200).json({ songArray })   
    })
    .catch(err => {
        res.status(500).json({ status: 'Internal server error!', err });
    });
});

// Gets a list of songs to play
app.get('/api/songsplaying', (req, res) => {

    const p1 = dbmongo.getCurrentSongsPlaying(atlasClient, 'songs_checked_out');
    const p2 = getAllSongs();
    Promise.all([p1, p2])
    .then(results => {
        const a1 = [];
        // console.log(results);
        results[0].map(v => {
            a1.push({
                title: v._id,
                users: v.total
            })
        })
        const a2 = [];
        results[1].map(v => {
            a2.push({
                title: v.title,
                country: v.country,
                countryCode: countryList.code(v.country).toLowerCase(),
                listen_slots: v.listen_slots
            })
        })
        // Attribution: https://stackoverflow.com/questions/19480008/javascript-merging-objects-by-id
        let hash = new Map();
        a1.concat(a2).forEach(function(obj) {
            hash.set(obj.title, Object.assign(hash.get(obj.title) || {}, obj))
        });
        const a3 = Array.from(hash.values());
        res.status(200).json({ result: a3 });
    })
    .catch(err => {
        res.status(500).json({ status: 'Internal server error!', err });
    });
})


// Play a song
app.get('/api/play/:song/:user', (req, res) => {
    // Get information
    const songName = req.params.song;
    const userName = req.params.user;
    // Insert into mongoDB
    // songs_checked_out will be used for deleting entries later when user clicks back
    // users_checked_out is for logging
    // users_history is also for logging
    promiseArray = [dbmongo.newPlay(atlasClient, 'songs_checked_out', userName, songName),
                    dbmongo.newPlay(atlasClient, 'users_checked_out', userName, songName),
                    dbmongo.newPlay(atlasClient, 'user_history', userName, songName),]
    Promise.all(promiseArray)
    .then(result => {
        // Get id so that entry in collection can be deleted to free up song
        const objId = result[0].insertedId;
        res.status(200).json({ result: objId });
    })
    .catch(err => {
        res.status(500).json({ status: 'Internal server error!', err });
    });
})

// Get a single song info
app.get('/api/song/:id', (req, res) => {
    const songName = req.params.id;
    getSong([ songName ])
    .then(result => {
        res.status(200).json({ result });
    })
    .catch(err => {
        res.status(500).json({ status: 'Internal server error!', err });
    });
})


// Serve static folders
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public', 'images')));

// Execute 3 promises from initdb.js
// If successful, start app.listen
testConnections(pool, atlasClient, s3)
	.then(() => {
		app.listen(PORT,
			() => {
				console.info(`Application started on port ${PORT} at ${new Date()}`);
			}
		)
	})
	.catch(error => {
		console.error(error);
		process.exit(-1);
    })


// atlasClient.db(mongoDBName).collection('songs_checked_out')
// .insertOne({
//     user_id: 'barney',
//     song_title: 'Star Spangled Banner',
//     checkOutDateTime: (new Date()).getTime()
// })

// atlasClient.db(mongoDBName).collection('songs_checked_out')
// .insertOne({
//     user_id: 'fred',
//     song_title: 'Star Spangled Banner',
//     checkOutDateTime: (new Date()).getTime()
// })
// .then(result => console.log(result.insertedId))
// .catch(err => console.log(err));