const API_URL = "https://api.anilibria.tv/v2/getRandomTitle";

const genreColors = {
    "Экшен": "rgba(255, 99, 71, 0.7)",
    "Комедия": "rgba(255, 165, 0, 0.7)",
    "Драма": "rgba(30, 144, 255, 0.7)",
    "Фэнтези": "rgba(138, 43, 226, 0.7)",
    "Романтика": "rgba(255, 105, 180, 0.7)",
    "Ужасы": "rgba(139, 0, 0, 0.7)",
    "Приключения": "rgba(60, 179, 113, 0.7)",
    "Фантастика": "rgba(0, 128, 128, 0.7)"
};

const App = {
    titles: [],
    isLoading: false,
    showImages: true,
    selectedTitle: null,

    loadMoreTitles: async function(count) {
        if (App.isLoading) return;
        App.isLoading = true;
        
        try {
            let titlesFetched = 0;
            while (titlesFetched < count) {
                const result = await m.request({
                    method: "GET",
                    url: API_URL,
                    params: {
                        filter: 'id,names,description,season.year,genres,type.full_string,posters.original.url,player.playlist',
                        description_type: 'plain'
                    }
                });
                
                if (!App.titles.find(title => title.id === result.id)) {
                    App.titles.push(result);
                    titlesFetched++;
                    m.redraw();
                } else {
                    console.log("Дубликат тайтла найден, повторный запрос...");
                }
                
                await new Promise(resolve => setTimeout(resolve, 75));
            }
        } catch (error) {
            console.error("Error fetching titles:", error);
        } finally {
            App.isLoading = false;
        }
    },    

    toggleImages: function() {
        App.showImages = !App.showImages;
        localStorage.setItem('showImages', App.showImages);
        const imageToggleBtn = document.getElementById('image-toggle');
        imageToggleBtn.textContent = App.showImages ? '📷' : '⚡';
        m.redraw();
    },

    selectTitle: function(title) {
        App.selectedTitle = title;
        m.redraw();
    },

    oninit: function() {
        const savedShowImages = localStorage.getItem('showImages');
        if (savedShowImages !== null) {
            App.showImages = savedShowImages === 'true';
        }
        App.loadMoreTitles(5);
        window.addEventListener('scroll', App.onScroll);
        const imageToggleBtn = document.getElementById('image-toggle');
        imageToggleBtn.addEventListener('click', App.toggleImages);
        imageToggleBtn.textContent = App.showImages ? '📷' : '⚡';
    },

    onremove: function() {
        window.removeEventListener('scroll', App.onScroll);
        const imageToggleBtn = document.getElementById('image-toggle');
        imageToggleBtn.removeEventListener('click', App.toggleImages);
    },

    onScroll: function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.offsetHeight;

        if (scrollTop + windowHeight >= documentHeight - 100 && !App.isLoading) {
            App.loadMoreTitles(5);
        }
    },

    view: function() {
        return m(".container", [
            App.titles.map(title => m(TitleBlock, { data: title, showImages: App.showImages })),
            App.isLoading ? m(".spinner") : null
        ]);
    }
};

const TitleBlock = {
    view: function(vnode) {
        const data = vnode.attrs.data;
        const showImages = vnode.attrs.showImages;
        const titleRu = data.names.ru || "Название неизвестно";
        const titleEn = data.names.en || "";
        const year = data.season && data.season.year ? data.season.year : "Год неизвестен";
        const genresArray = data.genres || [];
        const type = data.type && data.type.full_string ? data.type.full_string : "Тип неизвестен";
        const description = data.description || "Нет описания";
        const posterUrl = data.posters && data.posters.original && data.posters.original.url
                          ? "https://www.anilibria.tv" + data.posters.original.url
                          : "";

        return m(".title-block", [
            m(".title-content", {
                onclick: () => App.selectTitle(data)
            }, [
                showImages && posterUrl ? m("img.poster", { src: posterUrl, alt: titleRu, loading: "lazy" }) : null,
                m(".title-info", [
                    m("h2", titleRu),
                    m("p", [m("strong", "Год: "), year]),
                    m("p", [
                        m("strong", "Жанры: "),
                        genresArray.map((genre, index) => {
                            const decorationColor = showImages && genreColors[genre] ? genreColors[genre] : null;
                            return [
                                decorationColor ? m("span", { 
                                    style: { 
                                        textDecoration: "underline", 
                                        textDecorationColor: decorationColor, 
                                        textDecorationThickness: "2px",
                                        textUnderlineOffset: "3px"
                                    } 
                                }, genre) : genre,
                                index < genresArray.length - 1 ? ", " : ""
                            ];
                        })
                    ]),
                    m("p", [m("strong", "Тип: "), type])
                ])
            ]),
            App.selectedTitle === data 
                ? m(Player, { title: data }) 
                : m(".title-description", m("p", description))
        ]);
    }
};

const Player = {
    oninit: function(vnode) {
        const title = vnode.attrs.title;
        const episodes = Object.values(title.player && title.player.playlist ? title.player.playlist : {});
        
        if (episodes.length === 0) {
            console.error("Нет доступных серий для данного тайтла.");
            this.selectedEpisode = null;
            return;
        }

        this.episodes = episodes;
        this.selectedEpisode = episodes.find(ep => ep.serie === 1) || episodes[0];
        this.hls = null;
        this.lastLoadedSerie = null;
    },

    selectedEpisode: null,
    episodes: [],
    hls: null,
    lastLoadedSerie: null,

    oncreate: function(vnode) {
        this.onupdate(vnode);
    },    

    onremove: function() {
        if (this.hls) {
            this.hls.destroy();
        }
    },

    view: function(vnode) {
        const title = vnode.attrs.title;
        const baseUrl = "https://cache.libria.fun";
    
        if (!title.player || !title.player.playlist) {
            return m(".player-container", [
                m("h2", title.names.ru),
                m("p", "Нет доступных серий для воспроизведения.")
            ]);
        }
    
        const handleSerieChange = (e) => {
            const serieNumber = parseInt(e.target.value, 10);
            const episode = this.episodes.find(ep => ep.serie === serieNumber);
            if (episode) {
                this.selectedEpisode = episode;
                m.redraw();
            }
        };
    
        return m(".player-container", [
            m("video", { 
                controls: true, 
                autoplay: true, 
                style: { width: "99%", maxWidth: "900px" }
            }),
            m("label", { 
                for: "serie-input", 
                style: { marginRight: "5px" } 
            }, "Серия:"),
            m("input#serie-input", {
                type: "number",
                min: 1,
                max: this.episodes.length,
                value: this.selectedEpisode ? this.selectedEpisode.serie : 1,
                oninput: handleSerieChange,
                style: { width: "50px" }
            })
        ]);
    },    

    onupdate: function(vnode) {
        if (this.selectedEpisode && this.selectedEpisode.hls && this.selectedEpisode.hls.hd) {
            if (this.selectedEpisode.serie !== this.lastLoadedSerie) {
                this.lastLoadedSerie = this.selectedEpisode.serie;

                const video = vnode.dom.querySelector('video');
                const videoSrc = "https://cache.libria.fun" + this.selectedEpisode.hls.hd;

                if (this.hls) {
                    this.hls.destroy();
                }

                if (Hls.isSupported()) {
                    this.hls = new Hls();
                    this.hls.loadSource(videoSrc);
                    this.hls.attachMedia(video);
                    this.hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        video.play();
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = videoSrc;
                    video.addEventListener('loadedmetadata', function() {
                        video.play();
                    });
                } else {
                    console.error("HLS не поддерживается в этом браузере.");
                }
            }
        } else {
            console.error("HLS ссылка не найдена для серии:", this.selectedEpisode);
        }
    },
};

m.mount(document.getElementById("app"), App);
