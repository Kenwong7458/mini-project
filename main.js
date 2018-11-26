
const util = require("util")
const fs = require("fs")

const express = require("express")
const bodyParser = require("body-parser")
const cookieSession = require("cookie-session")
const formidable = require("formidable")
const flash = require("connect-flash")

const MongoClient = require("mongodb").MongoClient
const assert = require("assert")
const ObjectID = require("mongodb").ObjectID

const config = {
  port: getConfigVar("PORT"),
  secretKey: getConfigVar("SECRET_KEY"),
  mongodbURL: getConfigVar("MONGODB_URL")
}

function getConfigVar(name) {
  if (!process.env[name]) {
    /* eslint-disable-next-line no-console */
    console.error(`Environment variable ${name} not set`)
    process.exit(-1)
  }
  return process.env[name]
}

function loginRequired(req, res, next) {
  if (req.session.username) {
    next()
  } else {
    req.flash("info", "Please login first")
    res.redirect("/signin")
  }
}

function parsePhotoDocument(body, doc = {}) {
  function assign(dest, src, keys) {
    for (const k of keys) {
      if (src[k]) dest[k] = src[k]
    }
  }

  const address = {}

  assign(doc, body, ["name", "borough", "cuisine"])
  assign(address, body, ["street", "building", "zipcode"])

  if (body.photo) {
    doc.photo = body.photo.data.toString("base64")
    doc.photoMimetype = body.photo.type
  }

  if (body.lat && body.lng) {
    address.coord = [+body.lat, +body.lng]
  }

  if (Object.keys(address).length > 0) {
    doc.address = address
  }

  return doc
}

MongoClient.connect(config.mongodbURL, function(err, db) {

  function ownerRequired(req, res, next) {
    const id = req.query.id || req.body.id

    if (id) {
      db.collection("restaurants")
        .findOne({_id: ObjectID(id)}, {owner: 1}, function (err, result) {
          assert.equal(err, null)

          if (!result) {
            next()
          } else if (result.owner === req.session.username) {
            next()
          } else {
            req.flash("info", "Only the owner can perform this operation")
            res.redirect(req.headers.referer)
          }
        })
    } else {
      next()
    }
  }

  const app = express()

  app.listen(config.port, function() {
    /* eslint-disable-next-line no-console */
    console.log("Running on port " + config.port)
  })

  app.use(function (req, res, next) {
    /* eslint-disable-next-line no-console */
    console.log(new Date().toLocaleTimeString(), req.method, req.url)
    next()
  })

  app.use(cookieSession({
    name: "session",
    keys: [config.secretKey]
  }))

  app.use(bodyParser.json())

  app.use(bodyParser.urlencoded({extended: false}))

  app.use(function (req, res, next) {
    const readFile = util.promisify(fs.readFile)

    if (req.is("multipart/form-data")) {
      const form = new formidable.IncomingForm()

      form.parse(req, function (err, fields, files) {
        assert.equal(err)

        ;(async function () {
          const body = {}

          for (const [key, value] of Object.entries(fields)) {
            if (value === "") continue
            body[key] = value
          }

          for (const [key, file] of Object.entries(files)) {
            if (file.size === 0) continue
            body[key] = {
              data: await readFile(file.path),
              type: file.type,
              path: file.path,
              size: file.size,
              name: file.name
            }
          }

          req.body = body

          next()
        })()
      })
    } else {
      next()
    }
  })

  app.use(flash())

  app.use(function (req, res, next) {
    res.locals.username = req.session.username
    res.locals.messages = req.flash("info")
    next()
  })


  app.set("view engine", "ejs")

  app.get("/", loginRequired, function (req, res) {
    res.render("index.ejs")
  })

  app.get("/image", function (req, res) {
    const projection = {photo: 1, photoMimetype: 1}
    db.collection("restaurants")
      .findOne({_id: ObjectID(req.query.id)}, projection, function (err, result) {
        assert.equal(err, null)

        res.type(result.photoMimetype)
        res.send(Buffer.from(result.photo, "base64"))
      })
  })

  app.get("/signin", function(req, res) {
    res.render("signin.ejs")
  })

  app.get("/signup", function(req, res) {
    res.render("signup.ejs")
  })

  app.get("/restaurant/new", loginRequired, function(req, res) {
    res.render("restaurant/new.ejs")
  })

  app.get("/restaurant/list", loginRequired, function(req, res) {
    db.collection("restaurants")
      .find({}, {name: 1})
      .toArray(function (err, restaurants) {
        assert.equal(err, null)

        res.render("restaurant/list.ejs", {restaurants})
      })
  })

  app.get("/restaurant/show", loginRequired, function(req, res) {
    db.collection("restaurants")
      .findOne({"_id": ObjectID(req.query.id)}, {photo: 0}, function (err, restaurant) {
        assert.equal(err, null)

        res.render("restaurant/show.ejs", {restaurant})
      })
  })

  app.get("/restaurant/search", loginRequired, function(req, res) {
    if (Object.keys(req.query).length > 0) {
      const criteria = {}
      for (const [k, v] of Object.entries(req.query)) {
        if (v) criteria[k] = v
      }

      db.collection("restaurants")
        .find(criteria, {photo: 0})
        .toArray(function(err, restaurants) {
          assert.equal(err, null)

          res.render("restaurant/list.ejs", {restaurants})
        })
    } else {
      res.render("restaurant/search.ejs")
    }
  })

  app.get("/restaurant/rate", loginRequired, function(req, res) {
    const id = req.query.id
    const username = req.session.username

    db.collection("restaurants")
      .find({_id: ObjectID(id), "grades.user": username}).count(function (err, count) {
        assert.equal(err, null)

        if (count === 0) {
          res.render("restaurant/rate.ejs", {id: id})
        } else {
          req.flash("info", "You have already rated this restaurant before.")
          res.redirect(`/restaurant/show?id=${id}`)
        }
      })
  })

  app.get("/restaurant/delete", loginRequired, ownerRequired, function(req, res) {
    res.render("restaurant/delete.ejs", {id: req.query.id})
  })

  app.get("/restaurant/update", loginRequired, ownerRequired, function(req, res) {
    const restaurant_id = req.query.id

    db.collection("restaurants")
      .findOne({_id: ObjectID(restaurant_id)}, {photo: 0}, function (err, result) {
        assert.equal(err, null)

        res.render("restaurant/update.ejs", {result: result})
      })
  })

  app.post("/signup", function(req, res) {
    const username = req.body.username
    const password = req.body.password
    const cpassword = req.body.cpassword

    if (password !== cpassword) {
      req.flash("info", "Your password does not match")
      res.redirect("/signup")
    } else {
      db.collection("users").find({username: username}).toArray(function(err, result) {
        assert.equal(err, null)

        if (result.length > 0) {
          req.flash("info", "This username is invalid because it had been used.")
          res.redirect("/signup")
        } else {
          const doc = {"username": username, "password": password}
          db.collection("users").insertOne(doc, function (err) {
            assert.equal(err, null)

            req.flash("info", "Register successfully, please login now")
            res.redirect("/signin")
          })
        }
      })
    }
  })

  app.post("/signin", function(req, res) {
    const {username, password} = req.body

    db.collection("users").find({username, password}).count(function (err, count) {
      assert.equal(err, null)

      if (count === 1) {
        req.session.username = username
        res.redirect("/")
      } else {
        req.flash("info", "Your username or password is wrong.")
        res.redirect("/signin")
      }
    })
  })

  app.post("/logout", function (req, res) {
    req.session.username = null
    res.redirect("/signin")
  })

  app.post("/restaurant/new", loginRequired, function (req, res) {
    const doc = parsePhotoDocument(req.body)
    doc.owner = req.session.username
    doc.grades = []

    db.collection("restaurants").insertOne(doc, function(err) {
      assert.equal(err, null)

      req.flash("info", "Inserted 1 restaurant")
      res.redirect("/")
    })
  })

  app.post("/restaurant/update", loginRequired, function(req, res) {
    const criteria = {_id: ObjectID(req.body.id)}
    const doc = parsePhotoDocument(req.body)

    const updater = {
      $set: {},
      $unset: {borough: true, cuisine: true, address: true}
    }

    for (const [k, v] of Object.entries(doc)) {
      updater.$set[k] = v
      delete updater.$unset[k]
    }

    if (req.body.deletePhoto === "on") {
      updater.$unset.photo = true
      updater.$unset.photoMimetype = true
      delete updater.$set.photo
      delete updater.$set.photoMimetype
    }

    if (Object.keys(updater.$unset).length === 0) {
      delete updater.$unset
    }

    db.collection("restaurants").updateOne(criteria, updater, function (err) {
      assert.equal(err, null)

      res.redirect("/restaurant/update?id=" + req.body.id)
    })
  })

  app.post("/restaurant/delete", loginRequired, function(req, res) {
    const doc = {"_id": ObjectID(req.body.id)}

    db.collection("restaurants").deleteOne(doc, function(err) {
      if (err) throw err
      res.redirect("/")
    })
  })

  app.post("/restaurant/rate", loginRequired, function (req, res) {
    const {id, score} = req.body
    const username = req.session.username

    const criteria = {_id: ObjectID(id)}
    const updater = {$push: {grades: {user: username, score: +score}}}
    db.collection("restaurants")
      .updateOne(criteria, updater, function (err) {
        assert.equal(err, null)

        res.redirect("/")
      })
  })

})
