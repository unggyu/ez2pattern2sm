const axios = require('axios');
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

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
  },

  /**
   * 최대공약수
   * @param {*} a 
   * @param {*} b 
   * @returns 
   */
  gcd: function (a, b) {
    return a ? this.gcd(b % a, a) : b;
  },

  /**
   * 최소공배수
   * @param {*} a 
   * @param {*} b 
   */
  lcm: function (a, b) {
    return a * b / this.gcd(a, b);
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
    const thumbnailUrls = [
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    ];
    const downloadFolderPath = Utils.getExportFolderPath(title);
    const downloadPath = path.join(downloadFolderPath, `${title}.jpg`);
  
    for (let url of thumbnailUrls) {
      try {
        await this.downloadImageAsync(url, downloadPath);
        break; // 다운로드에 성공하면 반복문 종료
      } catch (error) {
        console.error(`Failed to download from ${url}. Trying next one...`);
      }
    }
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

    const videoInfos = [];
    const child = spawn('yt-dlp', ['-j', '--flat-playlist', playlistUrl]);
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', line => {
      const { id, title } = JSON.parse(line);
      videoInfos.push({ id, title });
    });
    await new Promise(resolve => child.on('close', code => resolve(code)));

    // 예시1: 
    const regex = /\[DJMax Respect V\] (?:.*?) - (.*?) \(M\/V 4K 60FPS\)/;
    const videoInfo = videoInfos.find(videoInfo => {
      if (title.toUpperCase() === 'Gloxinia'.toUpperCase()) {
        // 재생목록에는 Gloxinia곡만 위 정규식 포멧에 부합하지 않음
        return videoInfo.title === 'Gloxinia by Ruxxi, Milkoi';
      }

      const match = videoInfo.title.match(regex);
      return match && match[1].toUpperCase() === title.toUpperCase();
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
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(downloadPath, response.data);
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
   * 노트 타입
   */
  NOTE_TYPE: {
    NOTE: 'NOTE',
    LONG: 'LONG',
    SIDE: 'SIDE',
    MINE: 'MINE'
  },

  /**
   * 사이드 레인과 노트 레인 매핑
   */
  SIDE_LANE_2_NOTE_LANE_MAP: {
    A: [1, 2],
    B: [3, 4]
  },

  /**
   * 웹에서 평면채보를 파싱하여 메타데이터와 마디별 채보로 제공
   * @param {'djmax'} game 
   * @param {4} key 
   * @param {string} title 
   * @param {'NM' | 'HD' | 'MX' | 'SC'} pattern 
   */
  parseAsync: async function (game, key, title, pattern) {
    const targetUrl = `https://ez2pattern.kro.kr/${game}/chart/${key}B/${title}/${pattern}`;
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', (message) => {
      if (!message.startsWith('Could not parse CSS')) {
        console.error(message);
      }
    });
    const response = await axios.get(targetUrl);
    const dom = new JSDOM(response.data, {
      runScripts: 'dangerously',
      virtualConsole
    });
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

      // BPM 바 파싱
      const bpmBarElements = [...element.querySelectorAll('div.bpm')];
      const bpmBars = bpmBarElements.map(bpmBar => {
        const style = bpmBar.outerHTML.match(rowStyleRegexp)[1];
        const height = parseFloat(style.match(calcPxRegexp)[1]);
        const spanElement = bpmBar.querySelector('span');
        
        return {
          bpm: parseFloat(spanElement.textContent),
          posFraction: (this.SITE_MEASURE_HEIGHT_PX - height) / this.SITE_MEASURE_HEIGHT_PX
        }
      });

      // 노트 파싱
      const noteElements = [...element.querySelectorAll('div.note')];
      let notes = noteElements.map(({ outerHTML, className }) => {
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
            // 부동소수점 오차를 해결하기 위해 소수점 2자리까지 자름
            // 222.50000000000003 -> 222.50
            // 170.00000000000057 -> 170.00
            px = parseFloat(px.toFixed(2));

            return px;
          });

        // 클래스에 note-A, note-B가 포함되어있으면 사이드노트
        // 클래스에 long이 포함되어있으면 롱노트
        const noteType = (className.includes('long note-A') || className.includes('long note-B'))
          ? this.NOTE_TYPE.SIDE
          : className.includes('long')
            ? this.NOTE_TYPE.LONG
            : this.NOTE_TYPE.NOTE;

        // 바닥에서부터의 높이를 계산
        const isLongOrSideNote = noteType === this.NOTE_TYPE.LONG || noteType === this.NOTE_TYPE.SIDE;
        const height = this.SITE_MEASURE_HEIGHT_PX - (styleMarginTop + (isLongOrSideNote ? styleHeight : 0))
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
          // 사이드 노트 class 예시: note long note-A
          lane: className.replace(/note|long|-/g, '').trim(),
          noteType,
          beat,
          endBeat,
          posFraction: {
            // 0 ~ 1 사이값으로 노트의 위치를 나타냄
            start: height / this.SITE_MEASURE_HEIGHT_PX,
            end: endHeight / this.SITE_MEASURE_HEIGHT_PX
          }
        };

        return noteInfo;
      });
      
      // 사이드 노트를 모두 가져온 후 노트 목록에서 사이드 노트를 제거
      const sideNotes = notes.filter(note => note.noteType === this.NOTE_TYPE.SIDE);
      notes = notes.filter(note => note.noteType !== this.NOTE_TYPE.SIDE);

      // 사이드 노트를 32비트 지뢰 노트로 변환
      const sideNotesAsMines = sideNotes.map(sideNote => {
        const side2MinesBeat = 32;
        const lcmBeat = [sideNote.beat, sideNote.endBeat, side2MinesBeat].reduce(Utils.lcm.bind(Utils));
        const lcmFraction = 1 / lcmBeat;
        const sideLength = Math.round((sideNote.posFraction.end - sideNote.posFraction.start) / lcmFraction);
        const mineNotePairs = Array.from({ length: sideLength }, (_, idx) => {
          const posFraction = sideNote.posFraction.start + (lcmFraction * idx);
          const noteLanes = this.SIDE_LANE_2_NOTE_LANE_MAP[sideNote.lane];
          const notePair = noteLanes.map(noteLane => {
            return {
              lane: noteLane,
              noteType: this.NOTE_TYPE.MINE,
              beat: lcmBeat,
              endBeat: lcmBeat,
              posFraction: {
                start: posFraction,
                end: posFraction
              }
            };
          });

          return notePair;
        });
        const mineNotes = mineNotePairs.flat();

        return mineNotes;
      });
      const mineNotes = sideNotesAsMines.flat();
      notes.push(...mineNotes);

      return {
        number,
        bpmBars,
        notes
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
  /**
   * SM 노트 타입
   */
  SM_NOTE: {
    VOID: 0,
    STEP: 1,
    HOLD_START: 2,
    HOLD_OR_ROLL_END: 3,
    ROLL_START: 4,
    MINE: 'M'
  },

  /**
   * 입력 노트 타입
   */
  INPUT_NOTE_TYPE: {
    NOTE: 'NOTE',
    LONG: 'LONG',
    SIDE: 'SIDE',
    MINE: 'MINE'
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
    const bpmBars = this.getBpmBarsFromMeasures(measures, metadata.minBpm);
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
    // BPM 바들을 작성
    wstream.write('#BPMS:');
    const bpmStr = bpmBars.map(({ bpmBarPos: bpmDegree, bpm }) =>
      `${bpmDegree.toFixed(3)}=${bpm.toFixed(3)}\n`).join() + ';\n';
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

    // 마디별 채보를 작성
    wstream.write('   // Measure 0\n');
    smMeasures.forEach((measure, idx) => {
      measure.forEach(row => {
        // 노트들을 작성
        row.forEach(col => wstream.write(col.toString()));
        wstream.write('\n');
      });
      // 마지막 마디가 아닌 경우엔 콤마로 마디를 구분하고 주석을 작성
      // 마지막 마디인 경우엔 세미콜론으로 작성을 마무리함
      wstream.write(smMeasures.length === idx + 1 ? ';' : `,  //  Measure ${idx + 1} \n`);
    });
    wstream.write('\n');
    wstream.end();
  },

  /**
   * 파싱된 마디 목록에서 BPM 바들을 가져옴
   * @param {*} measures
   * @param {number} startBpm
   */
  getBpmBarsFromMeasures: function (measures, startBpm = 0) {
    // 각 BPM 바의 위치를 계산하고 취합함
    // SM에선 4비트 박자를 기준으로 위치를 지정함
    const bpmBars = measures.map(({ number, bpmBars }) => bpmBars.map(({ bpm, posFraction }) => ({
      bpmBarPos: 4 * ((number - 1) + posFraction),
      bpm,
    }))).flat();

    if (bpmBars.length <= 0) {
      // BPM 바가 없는 경우 metadata.minBpm으로 길이 1개짜리 배열을 만들어줌
      bpmBars.push({
        bpmBarPos: 0,
        bpm: startBpm,
      });
    }

    return bpmBars;
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
      const lcmBeat = beats.reduce(Utils.lcm.bind(Utils));
      // 최소공배수 * 4 제로필해주고 알맞은 위치에 노트를 채워넣음
      const twoDArray = this.createSmMeasure(lcmBeat);
      notes.forEach(({ noteType, posFraction, lane }) => {
        lane = parseInt(lane) - 1;
        const row = Math.round(lcmBeat * posFraction.start);
        switch (noteType) {
          case this.INPUT_NOTE_TYPE.NOTE:
            twoDArray[row][lane] = this.SM_NOTE.STEP
            break;
          case this.INPUT_NOTE_TYPE.MINE:
            twoDArray[row][lane] = this.SM_NOTE.MINE;
            break;
          default:
            if (unfinishedLongNoteMeasureIdx !== idx - 1) {
              // 아직 이전 마디의 롱노트가 끝나지도 않았는데 롱노트가 시작하는 것을 방지
              twoDArray[row][lane] = this.SM_NOTE.HOLD_START;
            }
            const endRow = Math.round(lcmBeat * posFraction.end);
            if (endRow < lcmBeat) {
              twoDArray[endRow][lane] = this.SM_NOTE.HOLD_OR_ROLL_END;
            } else {
              unfinishedLongNoteMeasureIdx = idx;
            }
            break;
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
