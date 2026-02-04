// config.js - API 설정 및 전역 변수
        const GEOJSON_URL = 'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json';
        const DONG_GEOJSON_URL = 'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_submunicipalities_geo_simple.json';

        // S-DoT Open API 설정
        const SDOT_API_KEY = '5171554e6d746563313030504d657451';
        const SDOT_API_BASE = 'http://openapi.seoul.go.kr:8088';
        const SDOT_SERVICE = 'IotVdata017';

        // 자치구 한글-영문 매핑 (API용)
        const districtNameMap = {
            "종로구": "Jongno-gu", "중구": "Jung-gu", "용산구": "Yongsan-gu",
            "성동구": "Seongdong-gu", "광진구": "Gwangjin-gu", "동대문구": "Dongdaemun-gu",
            "중랑구": "Jungnang-gu", "성북구": "Seongbuk-gu", "강북구": "Gangbuk-gu",
            "도봉구": "Dobong-gu", "노원구": "Nowon-gu", "은평구": "Eunpyeong-gu",
            "서대문구": "Seodaemun-gu", "마포구": "Mapo-gu", "양천구": "Yangcheon-gu",
            "강서구": "Gangseo-gu", "구로구": "Guro-gu", "금천구": "Geumcheon-gu",
            "영등포구": "Yeongdeungpo-gu", "동작구": "Dongjak-gu", "관악구": "Gwanak-gu",
            "서초구": "Seocho-gu", "강남구": "Gangnam-gu", "송파구": "Songpa-gu",
            "강동구": "Gangdong-gu"
        };

        // 영문-한글 역매핑
        const districtNameMapReverse = {};
        Object.entries(districtNameMap).forEach(([ko, en]) => {
            districtNameMapReverse[en] = ko;
        });

        // ASOS/AWS 관측소 데이터 (DB에서 동적 로딩)
        let asosStations = [];
        let awsStations = [];

        // 센서 레이어 토글 상태
        let sensorLayerState = {
            sdot: false,
            asos: false,
            aws: false
        };

        // 실시간 API 데이터 캐시
        let apiDataCache = {
            lastUpdate: null,
            data: [],
            byDistrict: {},
            bySensor: {}
        };

        // Replay 모드 관련 변수
        let replayMode = {
            enabled: false,
            date: null,
            hour: 12,
            isPlaying: false,
            playInterval: null,
            cachedData: {},
            cachedKeys: [],
            processedCache: {},
            isLoading: false
        };

        // Replay API 설정 (MySQL sdot_nature_all 연동)
        const REPLAY_API_BASE = `http://${location.hostname}:8000`;
        const replayApiConfig = {
            metadataLoaded: false,
            dateRange: {
                start: '2020-04-01',
                end: null
            },
            fetchTimeout: 10000,
            currentController: null
        };

        // 구 코드 매핑
        const districtCodes = {
            "종로구": "1101", "중구": "1102", "용산구": "1103", "성동구": "1104",
            "광진구": "1105", "동대문구": "1106", "중랑구": "1107", "성북구": "1108",
            "강북구": "1109", "도봉구": "1110", "노원구": "1111", "은평구": "1112",
            "서대문구": "1113", "마포구": "1114", "양천구": "1115", "강서구": "1116",
            "구로구": "1117", "금천구": "1118", "영등포구": "1119", "동작구": "1120",
            "관악구": "1121", "서초구": "1122", "강남구": "1123", "송파구": "1124",
            "강동구": "1125"
        };

        let geoData = null;
        let dongGeoData = null;
        let districtData = {};
        let dongData = {};
        let selectedDistrict = null;
        let selectedDong = null;
        let currentView = 'city';
        let mapSvg, mapProjection, mapPath;
        let currentZoom;
        let currentDistrictScale = 1;
        let currentDongScale = 1;
        let pendingLocationSubtitle = null; // 지역 진입 시 표시할 자막
        let pendingDongNavigation = null;  // 구 줌인 후 이동할 동 이름

        // 센서 데이터 (DB에서 동적 로딩)
        let sensorData = {};
        let sensorLocationMap = {};

