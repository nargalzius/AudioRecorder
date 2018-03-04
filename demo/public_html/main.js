// GENERAL VARIABLES
const api = '//transcriber.joystickinteractive.com/api/uploads';

function trace(str) {
	q$('#console').innerHTML = str;
}

const btnEnable = q$('#enable');
const btnStart = q$('#startRecording');
const btnStop = q$('#stopRecording');
const btnDownload = q$('#download');

btnStop.disabled = true;
btnStart.disabled = true;
btnDownload.disabled = true;

// let maxraw = 0;
// let maxslow = 0;

let ar = new AudioRecorder();
	ar.debug = true;
	// ar.autodetect = false;
	ar.callback_micSuccess = () => {
		btnEnable.disabled = true;
		btnStart.disabled = false;
	}
	ar.callback_onProgress = () => { 
		let realraw = ar.volume.raw;
		let realslow = ar.volume.slow;

		// if(maxraw < realraw)
		// 	maxraw = realraw;

		// if(maxslow < realslow)
		// 	maxraw = maxslow;

		trace('raw: '+ar.volume.raw+'<br>slow: '+ar.volume.slow);	
		// console.log(ar.volume); 
	};
	ar.callback_threshold = () => { 
		// alert('raw: '+ar.volume.raw+'<br>slow: '+ar.volume.slow)
	};
	ar.callback_startRecording = () => { 
		btnEnable.disabled = true;
		btnStart.disabled = true;
		btnStop.disabled = false;
	};
	ar.callback_stopRecording = () => { 
		btnStop.disabled = true;
		transcribe(function(e){
			btnStart.disabled = false;
			trace(e);
		})
	};
	ar.init();

btnEnable.onclick = () => {
	ar.enableMicrophone();
}

btnStart.onclick = () => {
	ar.startRecording();
}

btnStop.onclick = () => {
	ar.stopRecording();
}

function transcribe(callback) {
	trace('processing...');

	let self = this;
	let formData = new FormData();
		formData.append('attachment', ar.blob );

	$.ajax({
		url: api,
		data: formData,
		cache: false,
		contentType: false,
		processData: false,
		method: 'POST',
		type: 'POST',
		success(data) {
			console.log(data.text);
			callback(data.text.toLowerCase());
		},
		fail(data) {
			console.log(data);
		}
	});
}

