-- Seed data: major US airports, airlines and baggage rules.
-- Coordinates are airport reference points (rounded). For full coverage, import
-- the OurAirports dataset (https://ourairports.com/data/) into the same table.

INSERT INTO airports (iata, name, city, state, lat, lon, timezone) VALUES
 ('ATL','Hartsfield-Jackson Atlanta International','Atlanta','GA',33.6407,-84.4277,'America/New_York'),
 ('LAX','Los Angeles International','Los Angeles','CA',33.9416,-118.4085,'America/Los_Angeles'),
 ('ORD','Chicago O''Hare International','Chicago','IL',41.9742,-87.9073,'America/Chicago'),
 ('MDW','Chicago Midway International','Chicago','IL',41.7868,-87.7522,'America/Chicago'),
 ('DFW','Dallas/Fort Worth International','Dallas','TX',32.8998,-97.0403,'America/Chicago'),
 ('DAL','Dallas Love Field','Dallas','TX',32.8471,-96.8518,'America/Chicago'),
 ('DEN','Denver International','Denver','CO',39.8561,-104.6737,'America/Denver'),
 ('JFK','John F. Kennedy International','New York','NY',40.6413,-73.7781,'America/New_York'),
 ('LGA','LaGuardia','New York','NY',40.7769,-73.8740,'America/New_York'),
 ('EWR','Newark Liberty International','Newark','NJ',40.6895,-74.1745,'America/New_York'),
 ('SFO','San Francisco International','San Francisco','CA',37.6213,-122.3790,'America/Los_Angeles'),
 ('OAK','Oakland International','Oakland','CA',37.7126,-122.2197,'America/Los_Angeles'),
 ('SJC','San Jose Mineta International','San Jose','CA',37.3639,-121.9289,'America/Los_Angeles'),
 ('SEA','Seattle-Tacoma International','Seattle','WA',47.4502,-122.3088,'America/Los_Angeles'),
 ('PDX','Portland International','Portland','OR',45.5898,-122.5951,'America/Los_Angeles'),
 ('LAS','Harry Reid International','Las Vegas','NV',36.0840,-115.1537,'America/Los_Angeles'),
 ('PHX','Phoenix Sky Harbor International','Phoenix','AZ',33.4352,-112.0101,'America/Phoenix'),
 ('SAN','San Diego International','San Diego','CA',32.7338,-117.1933,'America/Los_Angeles'),
 ('SNA','John Wayne Airport','Santa Ana','CA',33.6762,-117.8675,'America/Los_Angeles'),
 ('SMF','Sacramento International','Sacramento','CA',38.6951,-121.5908,'America/Los_Angeles'),
 ('SLC','Salt Lake City International','Salt Lake City','UT',40.7899,-111.9791,'America/Denver'),
 ('MCO','Orlando International','Orlando','FL',28.4312,-81.3081,'America/New_York'),
 ('MIA','Miami International','Miami','FL',25.7959,-80.2870,'America/New_York'),
 ('FLL','Fort Lauderdale-Hollywood International','Fort Lauderdale','FL',26.0742,-80.1506,'America/New_York'),
 ('TPA','Tampa International','Tampa','FL',27.9755,-82.5332,'America/New_York'),
 ('CLT','Charlotte Douglas International','Charlotte','NC',35.2144,-80.9473,'America/New_York'),
 ('RDU','Raleigh-Durham International','Raleigh','NC',35.8801,-78.7880,'America/New_York'),
 ('IAH','George Bush Intercontinental','Houston','TX',29.9902,-95.3368,'America/Chicago'),
 ('HOU','William P. Hobby','Houston','TX',29.6454,-95.2789,'America/Chicago'),
 ('AUS','Austin-Bergstrom International','Austin','TX',30.1975,-97.6664,'America/Chicago'),
 ('BOS','Boston Logan International','Boston','MA',42.3656,-71.0096,'America/New_York'),
 ('MSP','Minneapolis-Saint Paul International','Minneapolis','MN',44.8848,-93.2223,'America/Chicago'),
 ('DTW','Detroit Metropolitan Wayne County','Detroit','MI',42.2162,-83.3554,'America/Detroit'),
 ('PHL','Philadelphia International','Philadelphia','PA',39.8744,-75.2424,'America/New_York'),
 ('BWI','Baltimore/Washington International','Baltimore','MD',39.1754,-76.6684,'America/New_York'),
 ('DCA','Ronald Reagan Washington National','Washington','DC',38.8512,-77.0402,'America/New_York'),
 ('IAD','Washington Dulles International','Washington','VA',38.9531,-77.4565,'America/New_York'),
 ('BNA','Nashville International','Nashville','TN',36.1263,-86.6774,'America/Chicago'),
 ('STL','St. Louis Lambert International','St. Louis','MO',38.7487,-90.3700,'America/Chicago'),
 ('MSY','Louis Armstrong New Orleans International','New Orleans','LA',29.9934,-90.2580,'America/Chicago'),
 ('HNL','Daniel K. Inouye International','Honolulu','HI',21.3187,-157.9225,'Pacific/Honolulu'),
 ('ANC','Ted Stevens Anchorage International','Anchorage','AK',61.1743,-149.9983,'America/Anchorage')
ON CONFLICT (iata) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, state = EXCLUDED.state,
  lat = EXCLUDED.lat, lon = EXCLUDED.lon, timezone = EXCLUDED.timezone;

INSERT INTO airlines (code, name, website_url) VALUES
 ('UA','United Airlines','https://www.united.com'),
 ('AA','American Airlines','https://www.aa.com'),
 ('DL','Delta Air Lines','https://www.delta.com'),
 ('WN','Southwest Airlines','https://www.southwest.com'),
 ('AS','Alaska Airlines','https://www.alaskaair.com'),
 ('B6','JetBlue Airways','https://www.jetblue.com')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, website_url = EXCLUDED.website_url;

-- 50 lb (23 kg) is the usual US economy checked-bag limit. Heavy-bag limits and
-- carry-on sizes differ by airline and change over time: verified_at stays NULL
-- until someone checks each row against the airline's baggage page.
INSERT INTO baggage_rules (airline_code, cabin, checked_limit_lb, heavy_limit_lb, carry_on_size, source_url, verified_at) VALUES
 ('UA','economy',50,70,'22 x 14 x 9 in','https://www.united.com/en/us/fly/baggage.html',NULL),
 ('AA','economy',50,70,'22 x 14 x 9 in','https://www.aa.com/i18n/travel-info/baggage/baggage.jsp',NULL),
 ('DL','economy',50,70,'22 x 14 x 9 in','https://www.delta.com/us/en/baggage/overview',NULL),
 ('WN','economy',50,70,'24 x 16 x 10 in','https://www.southwest.com/help/baggage',NULL),
 ('AS','economy',50,70,'22 x 14 x 9 in','https://www.alaskaair.com/content/travel-info/baggage',NULL),
 ('B6','economy',50,70,'22 x 14 x 9 in','https://www.jetblue.com/help/baggage',NULL)
ON CONFLICT (airline_code, cabin) DO NOTHING;
