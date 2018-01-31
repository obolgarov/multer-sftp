var path = require('path');
var crypto = require('crypto'); // for random bytes

module.exports = function (opts) {
  if (!opts || !opts.sftp) {
    throw 'sftp connection settings must be defined';
  }

  let client = new Client();
  client.connect(opts.sftp);

  let clientReady = new Promise((resolve, reject) => {
    client.on('ready', resolve);
  });

  let sftpPromise = new Promise((resolve, reject) => {
    clientReady.then(() => {
      client.sftp((err, sftp) => {
        if (err) reject(err);
        resolve(sftp);
      });
    });
  });

  return {
    opts: opts,
    client: client,
    clientReady: clientReady,
    sftpPromise: sftpPromise,

    // default functions
    destination: opts.destination || ((req, file, next) => {
      next(null, '.');
    }),
    filename: opts.filename || ((req, file, next) => {
      crypto.randomBytes(16, (err, raw) => {
        if (err) return next(err);
        next(null, raw.toString('hex') + path.extname(file.originalname));
      });
    }),

    // multer required functions
    _handleFile: function (req, file, next) {
      this.destination(req, file, (err, dest) => {
        if (err) return next(err);

        this.filename(req, file, (err, filename) => {
          if (err) return next(err);

          let fullPath = path.join(dest, filename);
          this.writeFile(file, fullPath)
          .then(() => next(null, {
            filename: filename,
            dest: dest,
            fullpath: fullpath
          }))
          .catch((err) => next(err));
        });
      });
    },

    _removeFile: function (req, file, next) {
      this.removeFile(file.path)
      .then(() => next(null))
      .catch((err) => next(err));
    },

    // helpers
    readdir: function (dir) {
      // used to test the connection, not needed in multer
      return new Promise((resolve, reject) => {
        this.sftpPromise.then((sftp) => {
          sftp.readdir(dir, (err, list) => {
            if (err) reject(err);
            resolve(list);
          })
        }).catch(reject);
      })
    },
    writeFile: function (file, dest) {
      return new Promise((resolve, reject) => {
        this.sftpPromise.then((sftp) => {
          let writeStream = sftp.createWriteStream(dest);
          writeStream.on('close', resolve);
          file.stream.pipe(writeStream); // stream defaults to autoclose, no manual closing needed
        }).catch(reject);
      });
    },
    removeFile: function (filePath) {
      return new Promise((resolve, reject) => {
        this.sftpPromsie.then((sftp) => {
          sftp.unlink(filePath, (err) => {
            if (err) reject(err);
            resolve('successfully removed: ' + filePath);
          });
        }).catch(reject);
      })
    }
  }
};
