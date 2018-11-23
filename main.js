
const url = require("url")

const express = require("express")
const bodyParser = require("body-parser")
const cookieParser = require("cookie-parser")
const cookieSession = require("cookie-session")
const fs = require("fs")
const formidable = require("formidable")
const bcrypt = require("bcrypt")

const config = require("./config")

const MongoClient = require("mongodb").MongoClient
const assert = require("assert")
const ObjectID = require("mongodb").ObjectID



MongoClient.connect(config.mongodbURL, function(err, db) {

  const app = express()

  app.listen(8099, function() {
    console.log("Running on port 8099")
  })

  app.use(cookieSession({
    name: "session",
    keys: [config.secretKey]
  }))

  app.use(bodyParser.json())

  app.use(bodyParser.urlencoded({extended: false}))

  app.use(cookieParser())


  app.set("view engine", "ejs")

  app.get("/", function (req, res) {
    res.redirect("/signin")
  })

  app.get("/signin", function(req, res) {
    res.render("signin.ejs")
  })

  app.get("/signup", function(req, res) {
    res.render("signup.ejs")
  })

  app.get("/index", function(req, res) {
    res.render("index.ejs", {username: req.session.username})
  })

  app.get("/createNewRestaurant", function(req, res) {
    res.render("create_new_restaurant.ejs", {username: req.session.username})
  })

  function queryAsArray(db, collection, query, callback) {
    const result = []
    const cursor = db.collection(collection).find(query)

    cursor.each(function (err, doc) {
      assert.equal(err, null)
      if(doc !== null) {
        result.push(doc)
      } else {
        callback(result)
      }
    })
  }

  app.post("/signup", function(req, res) {
    const username = req.body.username
    const password = req.body.password
    const cpassword = req.body.cpassword

    if (password !== cpassword) {
      res.send("Your password does not match")
    } else {
      db.collection("users").find({username: username}).toArray(function(err, result) {
        assert.equal(err, null)

        if (result.length > 0) {
          res.send("This username is invalid because it had been used.")
        } else {
          const doc = {"username": username, "password": password}
          db.collection("users").insertOne(doc, function (err) {
            assert.equal(err, null)
            res.send("Register successfully.")
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
        res.redirect("/index")
      } else {
        res.send("Your username or password is wrong.")
      }
    })
  })

  app.post("/createOneRestaurant", function(req, res) {
    const parsedURL = url.parse(req.url, true)
    const queryAsObject = parsedURL.query

    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
      console.log(JSON.stringify(files))

      var filename = files.fileUpload.path

      if (files.fileUpload.type) {
        var mimetype = files.fileUpload.type
      }
      console.log("filename = " + filename)
      fs.readFile(filename, function(err,data) {
        const newRest = {
          "restaurantName": fields.restaurantName,
          "borough": fields.borough,
          "cuisine": fields.cuisine,
          "street": fields.street,
          "building": fields.building,
          "zipcode": fields.zipcode,
          "lat": fields.lat,
          "lng": fields.lng,
          "rate": "",
          "owner": fields.owner,
          "mimetype": mimetype,
          "image": new Buffer(data).toString("base64")
        }

        if (err) throw err
        db.collection("restaurants").insertOne(newRest, function(err) {
          if (err) throw err
          console.log("1 document inserted")
        })
      })


      res.redirect("index")

    })
  })

  app.get("/updateRestaurant", function(req, res) {
    const username = req.session.username

    db.collection("restaurants").find({owner: username}).toArray(function (err, result) {
      assert.equal(err, null)

      res.render("show_restaurant_can_be_updated.ejs", {username, result})
    })
  })

  app.get("/updateRestaurantInfo", function(req, res) {
    const parsedURL = url.parse(req.url, true)
    const queryAsObject = parsedURL.query

    const restaurant_id = queryAsObject.restaurants_id

    searchRestaurantById(db, restaurant_id, function(result) {
      const contentType = result[0].mimetype
      const image = new Buffer(result[0].image, "base64")
      console.log(image)
      res.render("update_restaurant_info.ejs", {result: result})

    })

    function searchRestaurantById(db, restaurant_id, callback) {
      queryAsArray(db, "restaurants", {_id: ObjectID(restaurant_id)}, callback)
    }


  })

  app.post("/updateRestaurantToDatabase", function(req, res) {
    const parsedURL = url.parse(req.url, true)
    const queryAsObject = parsedURL.query

    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
      console.log(JSON.stringify(files))

      var filename = files.fileUpload.path

      if (files.fileUpload.type) {
        var mimetype = files.fileUpload.type
      }
      console.log("filename = " + filename)
      fs.readFile(filename, function(err,data) {
        if (err) throw err
        const criteria = {"_id": ObjectID(fields.restaurant_id)}
        if (files.fileUpload.size == 0) {
          const newValue = { $set: {
            "restaurantName": fields.newRestaurantName,
            "borough": fields.newBorough,
            "cuisine": fields.newCuisine,
            "street": fields.newStreet,
            "building": fields.newBuilding,
            "zipcode": fields.newZipcode,
            "lat": fields.newLat,
            "lng": fields.newLng,
            "owner": fields.newOwner
          }
          }
          db.collection("restaurants").updateOne(criteria, newValue, function(err) {
            if (err) throw err
            console.log("1 document updated")
          })
          res.redirect("index")
        } else {
          const newValue = { $set: {
            "restaurantName": fields.newRestaurantName,
            "borough": fields.newBorough,
            "cuisine": fields.newCuisine,
            "street": fields.newStreet,
            "building": fields.newBuilding,
            "zipcode": fields.newZipcode,
            "lat": fields.newLat,
            "lng": fields.newLng,
            "owner": fields.newOwner,
            "mimetype": mimetype,
            "image": new Buffer(data).toString("base64")
          }
          }
          db.collection("restaurants").updateOne(criteria, newValue, function(err) {
            if (err) throw err
            console.log("1 document updated")
          })
          res.redirect("index")
        }
      })
    })
  })

})
