const axios = require('axios');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const gcd = (a, b) => a ? gcd(b % a, a) : b; // 최대공약수
const lcm = (a, b) => a * b / gcd(a, b); // 최소공배수

const Utils = {
  /**
   * 인수 제공
   * @returns 
   */
  getArgs: function () {
    const game = 'djmax';
    const key = 4;
    const title = process.argv[2];
    if (!title) {
      throw new Error('title is required.')
    }
    const pattern = process.argv[3];
    if (!pattern) {
      throw new Error('pattern is required.');
    }

    return {
      game,
      key,
      title,
      pattern
    }
  },

  /**
   * 내보내기 폴더 경로 제공
   * @param {string} title 
   * @returns 
   */
  getExportFolderPath: function (title) {
    return path.join(__dirname, 'exports', title);
  },

  /**
   * 내보내기 폴더가 없는 경우 생성
   * @param {string} title
   */
  ensureExportFolder: function (title) {
    const exportFolderPath = this.getExportFolderPath(title);
    if (!fs.existsSync(exportFolderPath)) {
      // 내보낼 폴더가 없을 경우 생성해줌
      fs.mkdirSync(exportFolderPath, { recursive: true });
    }
  }
};

const SongDownloader = {
  /**
   * 제목을 통해 음원 다운로드
   * @param {'djmax'} game 
   * @param {string} title 
   * @returns 
   */
  downloadSongByTitleAsync: async function (game, title) {
    const downloadFolderPath = Utils.getExportFolderPath(title);
    const audioFileName = `${title}.mp3`;
    const downloadPath = path.join(downloadFolderPath, audioFileName);
    if (fs.existsSync(downloadPath)) {
      throw new Error('Already exists song file: ', downloadPath);
    }

    const videoId = await this.getDjmaxVideoIdByTitleAsync(title);
    await this.downloadSongByVideoIdAsync(title, videoId, downloadPath);

    return videoId;
  },

  /**
   * 비디오 ID를 통해 음원 다운로드
   * @param {string} title 
   * @param {string} videoId 
   * @param {string} downloadPath 
   */
  downloadSongByVideoIdAsync: async function (title, videoId, downloadPath = '') {
    const videoUrl = `https://youtu.be/${videoId}`;
    const child = spawn('yt-dlp', ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', downloadPath, videoUrl]);
    await new Promise(resolve => child.on('close', code => resolve(code)));
  },

  /**
   * 제목을 통해 영상의 썸네일을 다운로드하고 비디오 ID를 제공
   * @param {'djmax'} game 
   * @param {string} title 
   * @returns 
   */
  downloadVideoThumbnailByTitleAsync: async function (game, title) {
    const videoId = await this.getDjmaxVideoIdByTitleAsync(title);
    await this.downloadVideoThumbnailByVideoIdAsync(title, videoId);

    return videoId;
  },

  /**
   * 비디오 ID를 통해 썸네일 다운로드
   * @param {string} title 
   * @param {string} videoId 
   */
  downloadVideoThumbnailByVideoIdAsync: async function (title, videoId) {
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const downloadFolderPath = Utils.getExportFolderPath(title);
    const downloadPath = path.join(downloadFolderPath, `${title}.jpg`);
    this.downloadImageAsync(thumbnailUrl, downloadPath);
  },

  /**
   * 제목에 해당하는 디제이맥스 영상 ID를 제공
   * @param {string} title 
   * @returns 
   */
  getDjmaxVideoIdByTitleAsync: async function (title) {
    // 재생목록: DJMAX Respect V All Song (디제이맥스 리스펙트 V 모든 곡)
    const playlistId = 'PLtYQ7DpMMg-I22iICgrMNC1ln3ZT4FxUj';
    const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

    const child = spawn('yt-dlp', ['-j', '--flat-playlist', playlistUrl]);
    const videoInfos = [];
    child.stdout.on('data', data => {
      const videoInfoJson = data.toString();
      const videoInfo = JSON.parse(videoInfoJson);
      videoInfos.push(videoInfo);
    });
    await new Promise(resolve => child.on('close', code => resolve(code)));

    // 예시1: 
    const regex = /\[DJMax Respect V\] (?:.*?) - (.*?) \(M\/V 4K 60FPS\)/;
    const videoInfo = videoInfos.find(videoInfo => {
      if (title === 'Gloxinia') {
        // 재생목록에는 Gloxinia곡만 위 정규식 포멧에 부합하지 않음
        return videoInfo.title === 'Gloxinia by Ruxxi, Milkoi';
      }

      const match = videoInfo.title.match(regex);
      return match && match[1] === title;
    });
    const videoId = videoInfo.id;

    return videoId;
  },

  /**
   * 이미지 다운로드
   * @param {string} url 
   * @param {string} downloadPath
   */
  downloadImageAsync: async function (url, downloadPath) {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      fs.writeFileSync(downloadPath, response.data);
    } catch (error) {
      console.error('Error downloading image: ', error);
    }
  }
};

const Ez2PatternParser = {
  /**
   * 평면채보의 마디 높이
   */
  SITE_MEASURE_HEIGHT_PX: 240,

  /**
   * SM에서 사용 가능한 비트 목록
   */
  SM_BEATS: [4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 192],

  /**
   * 웹에서 평면채보를 파싱하여 메타데이터와 마디별 채보로 제공
   * @param {'djmax'} game 
   * @param {4} key 
   * @param {string} title 
   * @param {'NM' | 'HD' | 'MX' | 'SC'} pattern 
   */
  parseAsync: async function (game, key, title, pattern) {
    const targetUrl = `https://ez2pattern.kro.kr/${game}/chart/${key}B/${title}/${pattern}`;
    const resp = await axios.get(targetUrl);
    const dom = new JSDOM(resp.data, { runScripts: 'dangerously' });
    const document = dom.window.document;

    const metadata = {
      game,
      key,
      title,
      pattern,
      ...this.parseMetadata(document)
    };

    const measureElements = Array.from(document.querySelectorAll('div.column>div.bar:not(.empty)'));
    const measures = measureElements.map(element => {
      const rowStyleRegexp = /style="([^"]+)"/;
      const calcPxRegexp = /margin-top:calc\(((?:\d+\.)?\d+)+px(?:(?:.*?)height:calc\(((?:\d+\.)?\d+)px)?/;
      const number = parseInt(element.querySelector('div.bar-number').textContent);
      return {
        number,
        bpmBars: [...element.querySelectorAll('div.bpm')].map(divElement => {
          const style = divElement.outerHTML.match(rowStyleRegexp)[1];
          const height = parseFloat(style.match(calcPxRegexp)[1]);
          const spanElement = divElement.querySelector('span');
          
          return {
            bpm: parseFloat(spanElement.textContent),
            posFraction: (this.SITE_MEASURE_HEIGHT_PX - height) / this.SITE_MEASURE_HEIGHT_PX
          }
        }),
        notes: Array.from(element.querySelectorAll('div.note')).map(({ outerHTML, className }) => {
          // style.marginTop이 undefined라서 outerHTML을 통해 style 원시값을 구하여 정규식으로 px값을 파싱
          const rowStyle = outerHTML.match(rowStyleRegexp)[1];
          // 12비트 노트 style 예시1: margin-top:calc(220.00000000000114px * var(--note-height) - 4px);
          // match[0]: calc(220.00000000000114px
          // match[1]: 220.00000000000114
          // 롱노트 sytle 예시2: margin-top:calc(0px * var(--note-height));height:calc(240px  * var(--note-height))
          // matches[0]: margin-top:calc(0px * var(--note-height));height:calc(240px
          // matches[1]: 0
          // matches[2]: 240
          const [styleMarginTop, styleHeight] = rowStyle
            .match(calcPxRegexp)
            .slice(1)
            .map(match => {
              let px = parseFloat(match);
              // 222.50000000000003 -> 222.50
              // 170.00000000000057 -> 170.00
              px = parseFloat(px.toFixed(2));

              return px;
            });

          const isLong = className.includes('long');
          // 바닥에서부터의 높이를 계산
          // 롱노트의 경우엔 롱노트의 길이를 더 빼줌
          const height = this.SITE_MEASURE_HEIGHT_PX - (styleMarginTop + (isLong ? styleHeight : 0))
          // 롱노트의 끝 높이 계산
          // 일반노트는 height와 동일
          const endHeight = this.SITE_MEASURE_HEIGHT_PX - styleMarginTop;
          const getBeat = (height) => {
            // 다음과 같은 px로 딱 나누어 떨어진다면 해당 노트의 박자임
            // xbit = 240px / x
            // 4bit = 60px
            // 8bit = 30px
            // 12bit = 20px
            // 16bit = 15px
            // 20bit = 12px
            // 24bit = 10px
            // 32bit = 7.5px
            // ...
            const beat = this.SM_BEATS.find(beat => height % (this.SITE_MEASURE_HEIGHT_PX / beat) === 0);
            if (beat === undefined) {
              throw new Error(`Cannot extract beat in measure number ${number}`);
            }

            return beat;
          }
          const beat = getBeat(height);
          const endBeat = getBeat(endHeight);
          
          let noteInfo = {
            // 일반 노트 class 예시: note note-2
            // 롱 노트 class 예시: note long note-1
            // 배열에서 사용할 것이므로 -1 해줌
            lane: parseInt(className.replace(/note|long|-/g, '').trim()) - 1,
            isLong,
            beat,
            endBeat,
            posFraction: {
              // 0 ~ 1 사이값으로 노트의 위치를 나타냄
              start: height / this.SITE_MEASURE_HEIGHT_PX,
              end: endHeight / this.SITE_MEASURE_HEIGHT_PX
            }
          };

          return noteInfo;
        })
      }
    }).sort((a, b) => {
      // 마디 번호가 칼럼별 내림차순이므로 전체 오름차순으로 정렬해준다.
      return a.number - b.number;
    });

    const parseResult = {
      metadata,
      measures
    };

    return parseResult;
  },

  /**
   * 곡의 메타데이터 파싱
   * @param {*} document 
   * @returns 
   */
  parseMetadata: function (document) {
    // 곡 메타데이터 파싱
    const songInfoElement = document.querySelector('div.song-info');
    const artist = songInfoElement.querySelector('table:nth-child(1) > tbody > tr:nth-child(3) > td').textContent;
    const bpmRowText = songInfoElement
      .querySelector('table:nth-child(1) > tbody > tr:nth-child(4) > td > span')
      .textContent;
    // 예시1: 160 - 230
    // matches[0]: 160 - 230
    // matches[1]: 160
    // matches[2]: 160
    // matches[3]: 230
    // matches[4]: 230
    // 예시2: 191.91
    // matches[0]: 191.91
    // matches[1]: 191
    // matches[2]: 91
    const bpmRegexp = /(?:.*?)((?:\d+\.)?(\d+))(?: - )?((?:\d+\.)?(\d+))?/;
    const [minBpm,, maxBpm] = bpmRowText.match(bpmRegexp).slice(1).map(parseFloat);
    const star = songInfoElement.querySelector('div:nth-child(3)').childElementCount;

    const metadata = {
      artist,
      minBpm,
      maxBpm,
      star
    };

    return metadata;
  }
};

const SMWriter = {
  SM_NOTE: {
    VOID: 0,
    NOTE: 1,
    NOTE_LONG_START: 2,
    NOTE_LONG_END: 3
  },

  /**
   * 디맥 -> SM 패턴 매핑
   */
  DJMAX2SM_DIFFICULTY_MAP: {
    NM: 'Easy',
    HD: 'Medium',
    MX: 'Hard',
    SC: 'Challenge'
  },

  /**
   * 곡의 메타데이터와 마디별 채보로 SM 파일을 작성함
   * @param {*} metadata 
   * @param {*} measures 
   */
  write: function (metadata, measures) {
    const smMeasures = this.measures2SmMeasures(measures);
    const bpmBars = this.getBpmBarsFromMeasures(measures);
    const smFilePath = this.getExportPath(metadata.title);
    const bgName = metadata.bgPath ? path.basename(metadata.bgPath) : undefined;

    // .sm 포멧으로 작성
    const wstream = fs.createWriteStream(smFilePath);
    wstream.write(`#TITLE:${metadata.title};
  #SUBTITLE:;
  #ARTIST:${metadata.artist};
  #TITLETRANSLIT:;
  #SUBTITLETRANSLIT:;
  #ARTISTTRANSLIT:;
  #GENRE:;
  #CREDIT:;
  #MUSIC:${metadata.title}.mp3;
  #BANNER:${bgName ?? ''};
  #BACKGROUND:${bgName ?? ''};
  #CDTITLE:;
  #SAMPLESTART:0.000;
  #SAMPLELENGTH:0.000;
  #SELECTABLE:YES;
  #OFFSET:-0.0;\n`);
    // ez2pattern 사이트는 아직 변속 BPM인 경우 시작 BPM을 알 수 없음
    // 따라서 임시로 최소 BPM으로 시작하도록 함
    // TODO: 사이트에서 시작 BPM 정보 제공 시 수정 필요
    const bpmStr = [
      `#BPMS:0.000=${metadata.minBpm.toFixed(3)}\n`,
      ...bpmBars.map(({ bpmBarPos: bpmDegree, bpm }) => `${bpmDegree.toFixed(3)}=${bpm.toFixed(3)}\n`)
    ].join() + ';\n';
    wstream.write(bpmStr);
    wstream.write(`#STOPS:;
  #BGCHANGES:;
  #FGCHANGES:;
  //--------------- dance-single - unknown ----------------
  #NOTES:
      dance-single:
      unknown:
      ${this.DJMAX2SM_DIFFICULTY_MAP[metadata.pattern]}:
      ${metadata.star}:
      0,0,0,0,0:\n`);

    smMeasures.forEach((measure, idx) => {
      measure.forEach(row => {
        row.forEach(col => wstream.write(col.toString()));
        wstream.write('\n');
      });
      wstream.write(measure.length === idx + 1 ? ';\n' : ',\n');
    });

    wstream.end();
  },

  /**
   * 파싱된 마디 목록에서 BPM 바들을 가져옴
   */
  getBpmBarsFromMeasures: function (measures) {
    // 각 BPM 바의 위치를 계산하고 취합함
    // SM에선 4비트 박자를 기준으로 위치를 지정함
    return measures.map(({ number, bpmBars }) => bpmBars.map(({ bpm, posFraction }) => ({
      bpmBarPos: 4 * ((number - 1) + posFraction),
      bpm,
    }))).flat();
  },

  /**
   * 내보내기 경로를 제공
   * @param {string} title 
   * @returns 
   */
  getExportPath: function (title) {
    return path.join(Utils.getExportFolderPath(title), `${title}.sm`);
  },

  /**
   * 파싱된 마디별 채보를 SM 형식의 채보로 변환함
   * @param {*} measures 
   * @returns 
   */
  measures2SmMeasures: function (measures) {
    let unfinishedLongNoteMeasureIdx = Number.MAX_VALUE;
    const smMeasures = measures.map(({ notes }, idx) => {
      if (notes.length <= 0) {
        // 빈 마디는 4*4 제로필해줌
        return this.createSmMeasure(4);
      }

      // 모든 노트의 비트들을 불러와서 동일한 비트가 없도록 중복 제거
      let beats = [...notes.map(note => note.beat), ...notes.map(note => note.endBeat)];
      beats = Array.from(new Set(beats));
      // 해당 마디에 존재하는 비트들의 최소공배수를 구함
      const lcmBeat = beats.reduce(lcm);
      // 최소공배수 * 4 제로필해주고 알맞은 위치에 노트를 채워넣음
      const twoDArray = this.createSmMeasure(lcmBeat);
      notes.forEach(({ isLong, posFraction, lane, }) => {
        const row = Math.round(lcmBeat * posFraction.start);
        if (!isLong) {
          twoDArray[row][lane] = this.SM_NOTE.NOTE;
        } else {
          if (unfinishedLongNoteMeasureIdx !== idx - 1) {
            // 아직 이전 마디의 롱노트가 끝나지도 않았는데 롱노트가 시작하는 것을 방지
            twoDArray[row][lane] = this.SM_NOTE.NOTE_LONG_START;
          }
          const endRow = Math.round(lcmBeat * posFraction.end);
          if (endRow < lcmBeat) {
            twoDArray[endRow][lane] = this.SM_NOTE.NOTE_LONG_END;
          } else {
            unfinishedLongNoteMeasureIdx = idx;
          }
        }
      });
      
      return twoDArray;
    });

    return smMeasures;
  },

  /**
   * SM 빈마디를 제공함
   * @param {*} rowCount 
   * @returns 
   */
  createSmMeasure: function (rowCount) {
    return Array.from(Array(rowCount), () => Array(4).fill(this.SM_NOTE.VOID));
  }
};

(async () => {
  const {
    game,
    key,
    title,
    pattern
  } = Utils.getArgs();

  const smFilePath = SMWriter.getExportPath(title);
  if (fs.existsSync(smFilePath)) {
    // 파일이 이미 존재하므로 작업을 종료함
    throw new Error(`SM file already exists in path '${smFilePath}'`);
  }

  // 내보내기 폴더가 없는 경우 생성
  Utils.ensureExportFolder(title);

  // 음원 및 비디오 썸네일 다운로드
  console.log('Start downloading song and video thumbnail...');
  const videoId = await SongDownloader.downloadSongByTitleAsync(game, title);
  await SongDownloader.downloadVideoThumbnailByVideoIdAsync(title, videoId);
  console.log('Download completed.');

  // 평면 채보 파싱 및 SM 파일로 내보내기
  console.log('Start parsing and exporting to SM file...');
  const { metadata, measures } = await Ez2PatternParser.parseAsync(game, key, title, pattern);
  SMWriter.write(metadata, measures);
  console.log(`Exported to '${smFilePath}'`);
})();
