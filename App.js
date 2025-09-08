
import React, { useEffect, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Switch,
  Modal,
  Button,
} from 'react-native';
import * as Location from 'expo-location';


const OPENWEATHER_API_KEY = '821c8245eae8f6172f24da7dd5fe5e44';
const NEWSAPI_KEY = '8bd1fd8576eb430db92dcd0c169ef73d';

// actions
const SET_WEATHER = 'SET_WEATHER';
const SET_NEWS = 'SET_NEWS';
const SET_UNITS = 'SET_UNITS';
const SET_CATEGORIES = 'SET_CATEGORIES';
const SET_LOADING = 'SET_LOADING';

const setWeather = (payload) => ({ type: SET_WEATHER, payload });
const setNews = (payload) => ({ type: SET_NEWS, payload });
const setUnits = (payload) => ({ type: SET_UNITS, payload });
const setCategories = (payload) => ({ type: SET_CATEGORIES, payload });
const setLoading = (payload) => ({ type: SET_LOADING, payload });

// reducers
const initialState = {
  weather: null,
  news: [],
  units: 'metric', // or 'imperial'
  categories: ['general', 'technology', 'business'],
  loading: false,
};

function appReducer(state = initialState, action) {
  switch (action.type) {
    case SET_WEATHER:
      return { ...state, weather: action.payload };
    case SET_NEWS:
      return { ...state, news: action.payload };
    case SET_UNITS:
      return { ...state, units: action.payload };
    case SET_CATEGORIES:
      return { ...state, categories: action.payload };
    case SET_LOADING:
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

const rootReducer = combineReducers({ app: appReducer });
const store = createStore(rootReducer, applyMiddleware(thunk));



async function fetchWeatherByCoords(lat, lon, units = 'metric') {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${OPENWEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();
  return data;
}

async function fetchForecastByCoords(lat, lon, units = 'metric') {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${OPENWEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Forecast fetch failed');
  const data = await res.json();
  return data; // contains list[] of 3-hour entries
}

// News fetch - using NewsAPI (top-headlines). We'll fetch multiple categories and combine.
async function fetchNewsForCategories(categories = ['general'], pageSize = 30) {
  const country = 'us';
  const apiKey = NEWSAPI_KEY;
  const articles = [];

  for (const category of categories) {
    const url = `https://newsapi.org/v2/top-headlines?country=${country}&category=${category}&pageSize=${pageSize}&apiKey=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.articles && data.articles.length) {
        // attach category
        data.articles.forEach((a) => (a._category = category));
        articles.push(...data.articles);
      }
    } catch (e) {
      console.log('news fetch error', e.message);
    }
  }

  // dedupe by url
  const deduped = [];
  const seen = new Set();
  for (const art of articles) {
    if (!seen.has(art.url)) {
      deduped.push(art);
      seen.add(art.url);
    }
  }

  return deduped;
}


function moodFromWeather(weather) {
  // weather: object from OpenWeather current
  // Use temperature to decide: cold <=10, hot>=28, else cool
  const tempC = weather?.main?.temp; // depends on units passed
  if (tempC == null) return 'neutral';
  if (tempC <= 10) return 'cold';
  if (tempC >= 28) return 'hot';
  return 'cool';
}

const MOOD_KEYWORDS = {
  cold: ['death', 'crisis', 'loss', 'tragedy', 'disaster', 'disease', 'outbreak', 'suicide'],
  hot: ['attack', 'terror', 'fear', 'threat', 'danger', 'violence', 'panic', 'crash'],
  cool: ['win', 'victory', 'award', 'success', 'record', 'breakthrough', 'celebrate', 'happy'],
};

function filterNewsByWeatherMood(articles = [], mood = 'cool') {
  const keywords = MOOD_KEYWORDS[mood] || [];
  if (keywords.length === 0) return articles;

  const lower = (s) => (s || '').toLowerCase();

  const matched = articles.filter((a) => {
    const text = `${lower(a.title)} ${lower(a.description)}`;
    return keywords.some((kw) => text.includes(kw));
  });

  return matched.length ? matched : articles.slice(0, 20);
}


function fetchAllByCoords(lat, lon) {
  return async (dispatch, getState) => {
    try {
      dispatch(setLoading(true));
      const units = getState().app.units;

      const [weather, forecast, newsRaw] = await Promise.all([
        fetchWeatherByCoords(lat, lon, units),
        fetchForecastByCoords(lat, lon, units),
        fetchNewsForCategories(getState().app.categories),
      ]);

      // decide mood and filter news
      const mood = moodFromWeather(weather);
      const filtered = filterNewsByWeatherMood(newsRaw, mood);

      dispatch(setWeather({ current: weather, forecast }));
      dispatch(setNews(filtered));
    } catch (e) {
      console.log('fetchAll error', e.message);
    } finally {
      dispatch(setLoading(false));
    }
  };
}



function Header({ onToggleUnits, units }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Weather & News</Text>
      <TouchableOpacity onPress={onToggleUnits} style={styles.unitButton}>
        <Text style={styles.unitEmoji}>⚙️ {units === 'metric' ? '°C' : '°F'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function WeatherBlock({ weather }) {
  if (!weather) return null;
  const w = weather.current || weather;
  const temp = Math.round(w.main.temp);
  const desc = w.weather?.[0]?.description || '';
  return (
    <View style={styles.weatherCard}>
      <Text style={styles.city}>{w.name}</Text>
      <Text style={styles.temp}>{temp}°</Text>
      <Text style={styles.desc}>{desc}</Text>
    </View>
  );
}

function NewsItem({ item }) {
  return (
    <View style={styles.newsItem}>
      <Text style={styles.newsTitle}>{item.title}</Text>
      {item.description ? <Text style={styles.newsDesc}>{item.description}</Text> : null}
      <Text style={styles.newsMeta}>{item._category || ''}</Text>
    </View>
  );
}

/* -----------------------------
   Main Screen
   ----------------------------- */
function HomeScreenInner() {
  const dispatch = useDispatch();
  const { weather, news, units, loading } = useSelector((s) => s.app);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchCity, setSearchCity] = useState('');

  useEffect(() => {
    (async () => {
      // request permission and get location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const { latitude, longitude } = loc.coords;
      dispatch(fetchAllByCoords(latitude, longitude));
    })();
  }, []);

  const toggleUnitsLocal = () => {
    const newUnits = units === 'metric' ? 'imperial' : 'metric';
    dispatch(setUnits(newUnits));

    // refetch if we have a location (from weather)
    if (weather?.current?.coord) {
      const { lat, lon } = weather.current.coord;
      dispatch(fetchAllByCoords(lat, lon));
    }
  };

  const onSearchCity = async () => {
    if (!searchCity) return;
    try {
      dispatch(setLoading(true));
      // resolve city -> coordinates via OpenWeather geocoding
      const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(searchCity)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
      const geoRes = await fetch(geoUrl);
      const geoJson = await geoRes.json();
      if (!geoJson || !geoJson.length) {
        alert('City not found');
        return;
      }
      const { lat, lon } = geoJson[0];
      dispatch(fetchAllByCoords(lat, lon));
      setSearchCity('');
    } catch (e) {
      console.log('search error', e.message);
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header onToggleUnits={toggleUnitsLocal} units={units} />

      <View style={styles.searchRow}>
        <TextInput
          placeholder="Search city"
          value={searchCity}
          onChangeText={setSearchCity}
          style={styles.searchInput}
        />
        <TouchableOpacity onPress={onSearchCity} style={styles.searchBtn}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={{ marginTop: 24 }} />
      ) : (
        <View style={{ flex: 1 }}>
          <WeatherBlock weather={weather} />

          <Text style={styles.sectionTitle}>Top headlines filtered by weather</Text>
          <FlatList
            data={news}
            keyExtractor={(i) => i.url}
            renderItem={({ item }) => <NewsItem item={item} />}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        </View>
      )}

      {/* Settings modal to pick categories */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Choose categories</Text>
          {/* simple toggles for categories */}
          {['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'].map((cat) => (
            <CategoryToggle key={cat} cat={cat} />
          ))}

          <Button title="Close" onPress={() => setModalVisible(false)} />
        </SafeAreaView>
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={{ fontSize: 18 }}>⚙️</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function CategoryToggle({ cat }) {
  const dispatch = useDispatch();
  const categories = useSelector((s) => s.app.categories);
  const isOn = categories.includes(cat);
  const toggle = () => {
    const next = isOn ? categories.filter((c) => c !== cat) : [...categories, cat];
    dispatch(setCategories(next));
  };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 }}>
      <Text style={{ fontSize: 16 }}>{cat}</Text>
      <Switch value={isOn} onValueChange={toggle} />
    </View>
  );
}


export default function App() {
  return (
    <Provider store={store}>
      <HomeScreenInner />
    </Provider>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f8fb' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: '700' },
  unitButton: { padding: 6 },
  unitEmoji: { fontSize: 16 },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6e6ef',
  },
  searchBtn: {
    marginLeft: 8,
    backgroundColor: '#4e54c8',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 8,
  },
  searchBtnText: { color: '#fff', fontWeight: '600' },
  weatherCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
    alignItems: 'center',
  },
  city: { fontSize: 18, fontWeight: '700' },
  temp: { fontSize: 36, fontWeight: '800', marginTop: 6 },
  desc: { fontSize: 14, color: '#666', marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginLeft: 16, marginTop: 8 },
  newsItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#eef0f6' },
  newsTitle: { fontSize: 15, fontWeight: '700' },
  newsDesc: { fontSize: 13, color: '#555', marginTop: 6 },
  newsMeta: { fontSize: 12, color: '#999', marginTop: 8 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
});
