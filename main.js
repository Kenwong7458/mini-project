
const url = require("url")

const util = require("util")

const express = require("express")
const bodyParser = require("body-parser")
const cookieSession = require("cookie-session")
const fs = require("fs")
const formidable = require("formidable")
const flash = require("connect-flash")
const bcrypt = require("bcrypt")

const config = require("./config")

const MongoClient = require("mongodb").MongoClient
const assert = require("assert")
const ObjectID = require("mongodb").ObjectID


function loginRequired(req, res, next) {
  if (req.session.username) {
    next()
  } else {
    req.flash("info", "Please login first")
    res.redirect("/signin")
  }
}

function assign(dest, src, keys) {
  for (const k of keys) {
    if (src[k]) dest[k] = src[k]
  }
}

function parsePhotoDocument(body, owner) {
  const doc = {owner}
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

  const app = express()

  app.listen(config.port, function() {
    console.log("Running on port " + config.port)
  })

  app.use(function (req, res, next) {
    console.log(req.method, req.url)
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

  app.get("/signin", function(req, res) {
    res.render("signin.ejs")
  })

  app.get("/signup", function(req, res) {
    res.render("signup.ejs")
  })

  app.get("/restaurant/new", loginRequired, function(req, res) {
    res.render("restaurant/new.ejs")
  })

  app.get("/restaurant/list", function(req, res) {
    db.collection("restaurants")
      .find({}, {name: 1})
      .toArray(function (err, restaurants) {
        assert.equal(err, null)

        res.render("restaurant/list.ejs", {restaurants})
      })
  })

  app.get("/restaurant/show", function(req, res) {
    db.collection("restaurants")
      .findOne({"_id": ObjectID(req.query.id)}, function (err, restaurant) {
        assert.equal(err, null)

        res.render("restaurant/show.ejs", {restaurant})
      })
  })

  app.get("/restaurant/delete", function(req, res) {
    db.collection("restaurants")
      .find({}, {_id: 1, name: 1})
      .toArray(function(err, restaurants) {
        assert.equal(err, null)

        res.render("restaurant/delete.ejs", {restaurants})
      })
  })

  app.get("/restaurant/search", function(req, res) {
    if (Object.keys(req.query).length > 0) {
      db.collection("restaurants")
        .find({restaurantName: req.query.restName})
        .toArray(function(err, restaurants) {
          assert.equal(err, null)

          res.render("restaurant/list.ejs", {restaurants})
        })
    } else {
      res.render("restaurant/search.ejs")
    }
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

  app.post("/restaurant/new", function (req, res) {
    const doc = parsePhotoDocument(req.body, req.session.username)

    db.collection("restaurants").insertOne(doc, function(err) {
      assert.equal(err, null)

      req.flash("info", "Inserted 1 restaurant")
      res.redirect("/")
    })
  })

  app.get("/restaurant/update", function(req, res) {
    const username = req.session.username

    if (req.query.id) {
      const restaurant_id = req.query.id

      db.collection("restaurants").findOne({_id: ObjectID(restaurant_id)}, function (err, result) {
        assert.equal(err, null)

        res.render("restaurant/update_info.ejs", {result: result})
      })

    } else {
      db.collection("restaurants").find({owner: username}).toArray(function (err, result) {
        assert.equal(err, null)

        res.render("restaurant/update_list.ejs", {username, result})
      })
    }
  })

  app.post("/restaurant/update", function(req, res) {
    // WANRING: INCOMPLETE CODE ==========
    const doc = parsePhotoDocument(req.body, req.session.username)
    const criteria = {_id: ObjectID(req.body.id)}
    const operator = {$set: doc}

    console.log(doc)
    db.collection("restaurant").updateOne(criteria, operator, function (err) {
      assert.equal(err, null)

      res.redirect("/restaurant/update?id=" + req.body.id)
    })
    // ===================================
  })

  app.post("/restaurant/delete", function(req, res) {
    const doc = {"_id": ObjectID(req.body.id)}

    db.collection("restaurants").deleteOne(doc, function(err) {
      if (err) throw err
      res.redirect("/")
    })
  })

})
