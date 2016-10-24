const Affiliation = require('./affiliation');
const requests = require('./requests');
const debug = require('debug')('coffee');

const msgError = 'Klarte ikke lese status';
const msgDisconnected = 'Klarte ikke hente status';
const msgMissingSupport = 'Manglende støtte';

const retrieveCoffeeForToday = (coffeeDb, affiliation) => (
  new Promise((fullfill, reject) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    coffeeDb.find({
      $query: {
        affiliation: affiliation,
        brewed: {$gte: today} // Only match pots today
      },
      $orderby: {
        brewed: -1 // Latest first
      },
    }, (err, coffee) => {
      const pots = coffee.length;
      let date = null;
      if(pots > 0) {
        const lastPot = coffee[0];
        date = lastPot.brewed;
      }
      fullfill({ date, pots });
    });
  })
);

const get = (req, affiliation) => {
  return new Promise((fullfill, reject) => {
    if(!Affiliation.hasHardware(affiliation)) {
      reject(msgMissingSupport);
      return;
    }
    if(Affiliation.hasLegacyCoffee(affiliation)) {
      // Legacy coffee status
      getLegacy(affiliation)
      .catch(reject)
      .then(fullfill);
      return;
    }
    const coffeeDb = req.db.get('coffee');
    retrieveCoffeeForToday(coffeeDb, affiliation).then(fullfill);
  });
}

const getAll = (req, affiliation, limit=10) => (
  new Promise((fullfill, reject) => {
    if(!Affiliation.hasHardware(affiliation) || Affiliation.hasLegacyCoffee(affiliation)) {
      reject(msgMissingSupport);
      return;
    }
    const coffeeDb = req.db.get('coffee');
    coffeeDb.find({
      $query: {
        affiliation: affiliation
      },
      $orderby: {
        brewed: -1 // Latest first
      }
    }, {
      limit
    }, (err, pots) => {
      fullfill({
        pots: pots.map(pot => pot.brewed)
      });
    });
  })
)

const getLegacy = (affiliation) => (
  new Promise((fullfill, reject) => {
    const api = Affiliation.org[affiliation].hw.apis.coffee;
    // Receives the status for the coffee pot
    requests.get(api, {
      success: data => {
        try {
          // Split into pot number and age of last pot
          const pieces = data.split("\n");
          let pots = Number(pieces[0]);
          const ageString = pieces[1];

          let date = new Date(ageString);

          // We're only interested in pots today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if(today > date) {
            date = null;
            pots = 0;
          }
          fullfill({ date, pots });
        } catch (err) {
          debug('ERROR: Coffee format is wrong:', err);
          reject(msgError);
        }
      },
      error: (err, data) => {
        debug('ERROR: Failed to get coffee pot status.');
        reject(msgDisconnected);
      }
    });
  })
)

module.exports = {
  get, getAll
}
