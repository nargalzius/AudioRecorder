/*!
 *  HTML AUDIO RECORDER
 *
 *  1.0
 *
 *  author: Carlo J. Santos
 *  email: carlosantos@gmail.com
 *  documentation: https://github.com/nargalzius/AudioRecorder
 *
 *  Copyright (c) 2017, All Rights Reserved, www.nargalzius.com
 */

window.AudioContext = window.AudioContext || window.webkitAudioContext;

function AudioRecorder() {}

AudioRecorder.prototype = {
    ismobile: false,
	debug: false,
	autodetect: true,
	currentVolume: 0,
	isRecording: false,
	isSpeaking: false,
	audioContext: null,
	leftChannel: [],
	recordingLength: 0,
	microphone: null,
	processor: null,
	ready: false,
	config: {
		sampleRate: 44100,
		bufferLen: 4096,
		numChannels: 1,
		// mimeType: 'audio/mpeg'
		mimeType: 'audio/webm',
	},
	volume: {
		threshold: 0.3,
		raw: 0,
		slow: 0,
		clip: 0,
	},
	vol: 0,
	ave: 0,
	isSafari() {
		return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
	},
	checkForMobile() {
        const DESKTOP_AGENTS = [
            'desktop'
        ];

        let mobileFlag = true;

        if( window['device'] ) {
            // USE DEVICEJS IF AVAILABLE
            for (let i = 0; i < DESKTOP_AGENTS.length; i++) {
                let regex;
                    regex = new RegExp(DESKTOP_AGENTS[i], 'i');

                if( window.document.documentElement.className.match(regex) ) {
                    mobileFlag = false;
                }
            }
        } else {
            // BACKUP [RUDIMENTARY] DETECTION
            mobileFlag = 'ontouchstart' in window;
        }

        if( mobileFlag ) {
            this.ismobile = true;
            this.trace("mobile browser detected");
        } else {
            this.ismobile = false;
            this.trace("desktop browser detected");
        }
    },
	init() {
		this.checkForMobile();
		this.trace('init');
	},
	trace(e) {
		if (this.debug) console.log(e);
	},
	analyzer(context) {
		let listener = context.createAnalyser();
			listener.fftSize = 256;
		this.microphone.connect(listener);
		var bufferLength = listener.frequencyBinCount;
		let analyserData = new Uint8Array(bufferLength);
	},
	onAudioProcess(e) {
		var left = e.inputBuffer.getChannelData(0);

		this.recordingLength += this.config.bufferLen;

		// CLONE SAMPLES
		this.leftChannel.push(new Float32Array(left));

		// CHECK FOR PAUSE WHILE SPEAKING
		var sum = 0.0;
		var i;
		var clipcount = 0;
		for (i = 0; i < left.length; ++i) {
			sum += left[i] * left[i];
			if (Math.abs(left[i]) > 0.99) {
				clipcount += 1;
			}
		}

		var multiplier = 1

		// SAFARI ADJUSTMENT
		if(this.isSafari())
			multiplier = 0.094;

		// ANDROID ADJUSTMENT
		if(this.ismobile && !isSafari())
			multiplier = 0.0094;

		this.vol = Math.sqrt(sum / left.length) * multiplier;
		this.volume.raw = (this.vol * 100).toFixed(3);

		this.ave = 0.95 * this.ave + 0.05 * this.vol;
		this.volume.slow = (this.ave * 100).toFixed(3);

		this.volume.clip = clipcount / left.length;

		if (this.volume.slow > this.volume.threshold) {
			this.isSpeaking = true;
			clearTimeout(this.speakingTimeout);
		} else {
			if (this.isSpeaking) {
				this.isSpeaking = false;
				clearTimeout(this.speakingTimeout);
				this.speakingTimeout = setTimeout(() => {
					if (this.autodetect) this.stopRecording();
				}, 500);
			}
		}
		this.callback_onProgress();
	},
	enableMicrophone() {
		if( !this.ready ) this.startRecording(true);
	},
	startRecording(bool) {
		this.audioContext = new AudioContext();

		if(bool)
			this.ready = false;
		else
			this.ready = true;

		// CREATE ScriptProcessorNode
		if (this.audioContext.createJavaScriptNode) {
			this.processor = this.audioContext.createJavaScriptNode(this.config.bufferLen, this.config.numChannels, this.config.numChannels);
		} else if (this.audioContext.createScriptProcessor) {
			this.processor = this.audioContext.createScriptProcessor(this.config.bufferLen, this.config.numChannels, this.config.numChannels);
		} else {
			console.log('WebAudio API has no support on this browser.');
		}

		this.processor.connect(this.audioContext.destination);

		// ASK PERMISSION FOR USE OF MICROPHONE
		navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false
			})
			.then( this.gotStreamMethod.bind(this) )
			.catch((e) => {
				this.callback_micFailure(e)
			});
	},
	getBuffers(event) {
		var buffers = [];
		for (var ch = 0; ch < 2; ++ch) {
			buffers[ch] = event.inputBuffer.getChannelData(ch);
		}
		return buffers;
	},
	gotStreamMethod(stream) {

		// YOU CAN PUT YOUR audioElement.src HERE

		if( this.ready ) this.isRecording = true;

		this.tracks = stream.getTracks();

		// CREATE MediaStreamAudioSourceNode FOR this.microphone
		this.microphone = this.audioContext.createMediaStreamSource(stream);

		// CONNECT AudioBufferSourceNode (microphone) TO gainNode (processor)
		this.microphone.connect(this.processor);


		// encoder = new Mp3LameEncoder(audioContext.sampleRate, 160);

		// MIC ENABLER WORKAROUND
		if( !this.ready ) {
			this.audioContext.close();
			this.processor.disconnect();
			this.tracks.forEach(track => track.stop());
			this.ready = true;
			this.callback_micSuccess();
			return;
		}

		// GIVE THE NODE A FUNCTION TO PROCESS AUDIO EVENTS
		this.processor.onaudioprocess = (e) => {
			this.onAudioProcess(e)
		};
		this.analyzer(this.audioContext);
		this.callback_startRecording();
	},

	clearRecordedData() {
		this.recordingLength = 0;
		this.leftChannel = [];
	},

	stopRecording() {

		if(this.isRecording) {
			this.isRecording = false;
			this.audioContext.close();
			this.processor.disconnect();
			this.tracks.forEach(track => track.stop());


			this.mergeLeftRightBuffers({
				sampleRate: this.config.sampleRate,
				numberOfAudioChannels: this.config.numChannels,
				internalInterleavedLength: this.recordingLength,
				leftBuffers: this.leftChannel,
				rightBuffers: this.config.numChannels === 1 ? [] : rightChannel
			}, (buffer, view) => {

				this.blob = new Blob([view], {
					type: 'audio/webm;codecs=opus'
				});

				this.buffer = new ArrayBuffer(view.buffer.byteLength);
				this.view = view;
				this.sampleRate = this.config.sampleRate;
				this.bufferSize = this.config.bufferLen;
				this.length = this.recordingLength;

				this.callback_stopRecording(this.blob);
				this.clearRecordedData();

			});
		}
	},
	processInWebWorker(_function) {
		var workerURL = URL.createObjectURL(new Blob([_function.toString(),
			';this.onmessage =  function (e) {' + _function.name + '(e.data);}'
		], {
			type: 'application/javascript'
		}));

		var worker = new Worker(workerURL);
			worker.workerURL = workerURL;
		
		return worker;
	},

	callback_stopRecording(e) {
		this.trace('------------------------- callback_stopRecording');
		this.trace(e)
	},
	callback_startRecording() {
		this.trace('------------------------- callback_startRecording');
	},
	callback_threshold() {
		this.trace('------------------------- callback_threshold');
	},
	callback_micSuccess() {
		this.trace('------------------------- callback_micSuccess');
	},
	callback_micFailure(str) {
		alert('callback_micFailure:\n' + str);
	},
	callback_onProgress() {},

	// ?
	mergeLeftRightBuffers(config, callback) {
		function mergeAudioBuffers(config, cb) {
			var numberOfAudioChannels = config.numberOfAudioChannels;

			// todo: "slice(0)" --- is it causes loop? Should be removed?
			var leftBuffers = config.leftBuffers.slice(0);
			var rightBuffers = config.rightBuffers.slice(0);
			var sampleRate = config.sampleRate;
			var internalInterleavedLength = config.internalInterleavedLength;
			var desiredSampRate = config.desiredSampRate;

			if (numberOfAudioChannels === 2) {
				leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength);
				rightBuffers = mergeBuffers(rightBuffers, internalInterleavedLength);
				if (desiredSampRate) {
					leftBuffers = interpolateArray(leftBuffers, desiredSampRate, sampleRate);
					rightBuffers = interpolateArray(rightBuffers, desiredSampRate, sampleRate);
				}
			}

			if (numberOfAudioChannels === 1) {
				leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength);
				if (desiredSampRate) {
					leftBuffers = interpolateArray(leftBuffers, desiredSampRate, sampleRate);
				}
			}

			// SET SAMPLE RATE AS DESIRED SAMPLE RATE
			if (desiredSampRate) {
				sampleRate = desiredSampRate;
			}

			// FOR CHANGING THE SAMPLING RATE
			// REFERENCE: http://stackoverflow.com/a/28977136/552182
			function interpolateArray(data, newSampleRate, oldSampleRate) {
				var fitCount = Math.round(data.length * (newSampleRate / oldSampleRate));
				var newData = [];
				var springFactor = Number((data.length - 1) / (fitCount - 1));
				
				// FOR NEW ALLOCATION
				newData[0] = data[0];
				
				for (var i = 1; i < fitCount - 1; i++) {
					var tmp = i * springFactor;
					var before = Number(Math.floor(tmp)).toFixed();
					var after = Number(Math.ceil(tmp)).toFixed();
					var atPoint = tmp - before;
					newData[i] = linearInterpolate(data[before], data[after], atPoint);
				}

				 // FOR NEW ALLOCATION
				newData[fitCount - 1] = data[data.length - 1];
				
				return newData;
			}

			function linearInterpolate(before, after, atPoint) {
				return before + (after - before) * atPoint;
			}

			function mergeBuffers(channelBuffer, rLength) {
				var result = new Float64Array(rLength);
				var offset = 0;
				var lng = channelBuffer.length;

				for (var i = 0; i < lng; i++) {
					var buffer = channelBuffer[i];
					result.set(buffer, offset);
					offset += buffer.length;
				}

				return result;
			}

			function interleave(leftChannel, rightChannel) {
				var length = leftChannel.length + rightChannel.length;

				var result = new Float64Array(length);

				var inputIndex = 0;

				for (var index = 0; index < length;) {
					result[index++] = leftChannel[inputIndex];
					result[index++] = rightChannel[inputIndex];
					inputIndex++;
				}
				return result;
			}

			function writeUTFBytes(view, offset, string) {
				var lng = string.length;
				for (var i = 0; i < lng; i++) {
					view.setUint8(offset + i, string.charCodeAt(i));
				}
			}

			// INTERLEAVE BOTH CHANNELS TOGETHER
			var interleaved;

			if (numberOfAudioChannels === 2) {
				interleaved = interleave(leftBuffers, rightBuffers);
			}

			if (numberOfAudioChannels === 1) {
				interleaved = leftBuffers;
			}

			var interleavedLength = interleaved.length;

			// CREATE WAV FILE
			var resultingBufferLength = 44 + interleavedLength * 2;

			var buffer = new ArrayBuffer(resultingBufferLength);

			var view = new DataView(buffer);

			// RIFF CHUNK DESCRIPTOR/IDENTIFIER
			writeUTFBytes(view, 0, 'RIFF');

			// RIFF CHUNK LENGTH
			view.setUint32(4, 44 + interleavedLength * 2, true);

			// RIFF TYPE
			writeUTFBytes(view, 8, 'WAVE');

			// FORMAT CHUNK IDENTIFIER
			// FMT SUB-CHUNK
			writeUTFBytes(view, 12, 'fmt ');

			// FORMAT CHUNK LENGTH
			view.setUint32(16, 16, true);

			// SAMPLE FORMAT (RAW)
			view.setUint16(20, 1, true);

			// STEREO (2 CHANNELS)
			view.setUint16(22, numberOfAudioChannels, true);

			// SAMPLE RATE
			view.setUint32(24, sampleRate, true);

			// BYTE RATE (SAMPLE RATE * BLOCK ALIGN)
			view.setUint32(28, sampleRate * 2, true);

			// BLOCK ALIGN (CHANNEL COUNT * BYTES PER SAMPLE)
			view.setUint16(32, numberOfAudioChannels * 2, true);

			// BITS PER SAMPLE
			view.setUint16(34, 16, true);

			// DATA SUB-CHUNK
			// DATA CHUNK IDENTIFIER
			writeUTFBytes(view, 36, 'data');

			// DATA CHUNK LENGTH
			view.setUint32(40, interleavedLength * 2, true);

			// WRITE THE PCM SAMPLES
			var lng = interleavedLength;
			var index = 44;
			var volume = 1;
			for (var i = 0; i < lng; i++) {
				view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
				index += 2;
			}

			if (cb) {
				return cb({
					buffer: buffer,
					view: view
				});
			}

			postMessage({
				buffer: buffer,
				view: view
			});
		}

		var webWorker = this.processInWebWorker(mergeAudioBuffers);

		webWorker.onmessage = function(event) {
			callback(event.data.buffer, event.data.view);

			// RELEASE MEMORY
			URL.revokeObjectURL(webWorker.workerURL);
		};

		webWorker.postMessage(config);
	},

	/*
	downloadRecording() {
		if (!this.recorder || !this.recorder.getBlob()) return;

		let ext = 'webm'; // DEFAULT

		// FIREFOX
		if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) ext = 'ogg';

		if (this.isSafari) {
			this.recorder.getDataURL((dataURL) => {
				this.SaveToDisk(dataURL, this.getFileName(ext));
			});
			return;
		}

		let blob = this.recorder.getBlob();
		let file = new File([blob], this.getFileName(ext), {
			type: 'audio/' + ext + ';codecs=opus'
		});
		invokeSaveAsDialog(file);
	},
	getFileName(fileExtension) {

		let d = new Date();
		let year = d.getFullYear();
		let month = d.getMonth();
		let date = d.getDate();
		return (
			'RecordRTC-' +
			year +
			month +
			date +
			'-' +
			this.getRandomString() +
			'.' +
			fileExtension
		);
	},
	getRandomString() {
		if (
			window.crypto &&
			window.crypto.getRandomValues &&
			navigator.userAgent.indexOf('Safari') === -1
		) {
			let a = window.crypto.getRandomValues(new Uint32Array(3)),
				token = '';
			for (let i = 0, l = a.length; i < l; i++) {
				token += a[i].toString(36);
			}
			return token;
		} else {
			return (Math.random() * new Date().getTime())
				.toString(36)
				.replace(/\./g, '');
		}
	},
	SaveToDisk(fileURL, fileName) {
		// for non-IE
		if (!window.ActiveXObject) {
			let save = document.createElement('a');
			save.href = fileURL;
			save.download = fileName || 'unknown';
			save.style = 'display:none;opacity:0;color:transparent;';

			(document.body || document.documentElement).appendChild(save);

			if (typeof save.click === 'function') {
				save.click();
			} else {
				save.target = '_blank';
				let event = document.createEvent('Event');
				event.initEvent('click', true, true);
				save.dispatchEvent(event);
			}

			(window.URL || window.webkitURL).revokeObjectURL(save.href);
		} else if (!!window.ActiveXObject && document.execCommand) {
			// for IE
			let _window = window.open(fileURL, '_blank');
			_window.document.close();
			_window.document.execCommand('SaveAs', true, fileName || fileURL);
			_window.close();
		}
	},

	*/
	getAudioData() {
		return this.blob;
	},
};