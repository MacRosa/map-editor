function calculateTextPosition(px,py,alpha,textWidth,textHeight) {
    let xOffset = 0;
    let yOffset = 0;
    let angle = 0;
    if(alpha >= 360){
        angle = alpha - 360;
        xOffset = textWidth * (angle/90);
        let revAngle = 1 - (angle/90);
        yOffset = -textHeight * revAngle;
    }else{
        angle = alpha - 90;
        let revAngle = 1 - (angle/90);
        xOffset = -textWidth * revAngle;
        if(alpha > 180){
            angle = angle - 180;
            yOffset = textHeight * (angle/90);
        }else{
            yOffset = -textHeight * (angle/90);
        }
    }
    return {x:px+xOffset,y:py+yOffset};
}

let actionDescriptor = null;

let points = [];
let lines = [];
let areas = [];

let areaTab = null;
let pointTab = null;
let lineTab = null;
let textTab = null;
let dragging = false;
let dragStop = false;
let mapRect = null;

function insertPoint(point){
    point.data("type","point");
    point.insertBefore(pointTab);
}
function insertLine(line){
    line.data("type","line");
    line.insertBefore(lineTab);
}
function insertArea(area){
    area.data("type","area");
    area.insertBefore(areaTab);
}
function insertText(text){
    text.data("type","text");
    text.insertBefore(textTab);
}

class HierarchyMovement{
    constructor(moveUpBtnId,moveDownBtnId){
        this.selectedElement = null;
        this.moveUpBtn = $("#" + moveUpBtnId);
        this.moveDownBtn = $("#" + moveDownBtnId);
        this.moveUpBtn.click(this,function(event){
            event.data.moveUp();
        });
        this.moveDownBtn.click(this,function(event){
            event.data.moveDown();
        });
    }


    static isTab(element,tabType){
        if(element.data("tab") === null)
            return false;
        return element.data("tab") === tabType;
    }

    static canMoveUp(element){
        switch(element.data("type")){
            case "point":
                return !HierarchyMovement.isTab(element.next,"point");
            case "line":
                return !HierarchyMovement.isTab(element.next,"line");
            case "area":
                return !HierarchyMovement.isTab(element.next,"area");

        }
        return false;
    }

    static canMoveDown(element){
        switch(element.data("type")){
            case "point":
                return !HierarchyMovement.isTab(element.prev,"line");
            case "line":
                return !HierarchyMovement.isTab(element.prev,"area");
            case "area":
                return element.prev.type !== "rect";
        }
        return false;
    }


    activate(element){
        this.selectedElement = element;
        this.moveUpBtn.prop("disabled",!HierarchyMovement.canMoveUp(element.shape));
        this.moveDownBtn.prop("disabled",!HierarchyMovement.canMoveDown(element.shape));
    }

    moveUp() {
        if(this.selectedElement === null)
            return;
        if(HierarchyMovement.canMoveUp(this.selectedElement.shape)){
            this.selectedElement.shape.insertAfter(this.selectedElement.shape.next);
            this.selectedElement.moveUp();
            this.activate(this.selectedElement);
        }
    }

    moveDown(){
        if(this.selectedElement === null)
            return;
        if(HierarchyMovement.canMoveDown(this.selectedElement.shape)){
            this.selectedElement.shape.insertBefore(this.selectedElement.shape.prev);
            this.selectedElement.moveDown();
            this.activate(this.selectedElement);
        }
    }

    deactivate(){
        this.selectedElement = null;
        this.moveUpBtn.prop("disabled",true);
        this.moveDownBtn.prop("disabled",true);
    }
}

let hierarchyMovement = null;

class ColorChooser {
    constructor(panel,chooser){
        this.panel = panel;
        this.chooser = chooser;
        this.changeOnColorContext = null;
        this.colorChangedFunction = function(context) {};
        this.hidePanel();
        let tThis = this;
        $("#" + this.chooser).spectrum({
            showPalette : true,
            color: "#000000",
            change : function () {
                tThis.colorChange();
            }
        });
    }

    colorChange(){
        this.colorChangedFunction(this.changeOnColorContext);
    }

    setOnColorChangeFunction(context,func){
        this.changeOnColorContext = context;
        this.colorChangedFunction = func;
    }

    showPanel(){
        $("#"+this.panel).show();
    }

    hidePanel(){
        $("#"+this.panel).hide();
    }

    getColorRGBValue() {
        return $("#"+this.chooser).spectrum("get").toHexString();
    }

    setColor(colorString){
        $("#"+this.chooser).spectrum("set",colorString);
    }
}

class SizeChooser{
    constructor(panel,chooser,button){
        this.panel = panel;
        this.chooser = chooser;
        this.button = button;
        this.sizeChangeContext = null;
        this.sizeChangedFunction = function(context) {};
        this.hidePanel();
        $("#"+this.button).click(this,function(event){
            event.data.sizeChange();
        });
    }

    setOnSizeChangeFunction(context,func){
        this.sizeChangeContext = context;
        this.sizeChangedFunction = func;
    }

    sizeChange(){
        this.sizeChangedFunction(this.sizeChangeContext);
    }

    setValue(value){
        $("#"+this.chooser).val(value);
    }

    getValue(){
        return $("#"+this.chooser).val();
    }

    showPanel(){
        $("#"+this.panel).show();
    }

    hidePanel(){
        $("#"+this.panel).hide();
    }
}


let strokeColorChooser = null;
let fillColorChooser = null;
let pointSizeChooser = null;

let strokeWidthChooser = null;

let textSizeChooser = null;
let textColorChooser = null;


let paper = null;

function getRectFromElement(element){
    let bbox = element.getBBox();
    return paper.rect(bbox.x,bbox.y,bbox.width,bbox.height);
}

let currentAction = null;
let nameInput = null;
let nameField = null;
let addSegmentButton = null;
let deleteSegmentButton = null;
let modCurve = null;
let enterButton = null;

class Element{
    constructor(shape, text){
        this.shape = shape;
        this.text = text;
        this.editTextPos = false;
    }

    elementSelected() {
        textSizeChooser.showPanel();
        textSizeChooser.setValue(this.text.attrs['font-size']);
        textSizeChooser.setOnSizeChangeFunction(this,function(context){
            context.text.attr({'font-size' : this.getValue()});
        });

        textColorChooser.showPanel();
        textColorChooser.setColor(this.text.attrs.fill);
        textColorChooser.setOnColorChangeFunction(this,function(context){
            context.text.attr({fill: this.getColorRGBValue()});
        });

    }
    selectionRemoved() {
        if(this.editTextPos){
            this.editTextPosSqr.remove();
            this.editTextPos = false;
        }
        textSizeChooser.hidePanel();
        textColorChooser.hidePanel();
    }
    moveStart() {}
    onMove(dx,dy) {}

    nameChanged(newName) {}
    elementDeleted() {}
    startAddingSegments() {}
    segmentAdded(x, y) {}
    stopAddingSegments() {}

    removePathSegment() {}

    textDblClick() {
        this.editTextPos = true;
        this.editTextPosSqr = getRectFromElement(this.text);//.attr({x:x-5,y:y-5,width:width+5,height:height+5});
        this.editTextPosSqr.attr({x: this.editTextPosSqr.attrs.x - 5, y: this.editTextPosSqr.attrs.y - 5,
                                width: this.editTextPosSqr.attrs.width + 10, height: this.editTextPosSqr.attrs.height + 10})
    }

    textMoveStart(){
        this.textCoords = {
            x : this.text.attr("x"),
            y : this.text.attr("y"),
            tbx : this.editTextPosSqr.attr("x"),
            tby : this.editTextPosSqr.attr("y"),
        };
        // noinspection JSUnresolvedVariable
        if(this.textSelectionBox != null){
            // noinspection JSUnresolvedVariable
            this.textCoords.atbx = this.textSelectionBox.attr("x");
            // noinspection JSUnresolvedVariable
            this.textCoords.atby = this.textSelectionBox.attr("y");
        }
    }

    textOnMove(dx,dy){
        this.text.attr({x:this.textCoords.x+dx,y:this.textCoords.y+dy});
        this.editTextPosSqr.attr({x:this.textCoords.tbx+dx,y:this.textCoords.tby+dy});
        // noinspection JSUnresolvedVariable
        if(this.textSelectionBox != null){
            // noinspection JSUnresolvedVariable
            this.textSelectionBox.attr({x:this.textCoords.atbx+dx,y:this.textCoords.atby+dy});
        }
    }

    moveUp() {}

    moveDown() {}
}

class PointElement extends Element{
    constructor(shape, text){
        super(shape, text);
        this.shapeSelectionBox = null;
        this.textSelectionBox = null;
    }

    elementSelected(){
        super.elementSelected();
        this.shapeSelectionBox = getRectFromElement(this.shape);
        this.textSelectionBox = getRectFromElement(this.text);
        strokeColorChooser.showPanel();
        strokeColorChooser.setColor(this.shape.attrs.stroke);
        strokeColorChooser.setOnColorChangeFunction(this,function(context){
            context.shape.attr({stroke: this.getColorRGBValue()});
        });

        fillColorChooser.showPanel();
        fillColorChooser.setColor(this.shape.attrs.fill);
        fillColorChooser.setOnColorChangeFunction(this,function(context){
            context.shape.attr({fill: this.getColorRGBValue()});
        });

        pointSizeChooser.showPanel();
        pointSizeChooser.setValue(this.shape.attrs.r);
        pointSizeChooser.setOnSizeChangeFunction(this,function(context){
            context.shape.attr({r: this.getValue()});
        });
    }

    selectionRemoved() {
        super.selectionRemoved();
        this.shapeSelectionBox.remove();
        this.textSelectionBox.remove();
        strokeColorChooser.hidePanel();
        fillColorChooser.hidePanel();
        pointSizeChooser.hidePanel();
    }

    moveStart(){
        if(this.editTextPos){
            this.textMoveStart();
            return;
        }
        this.startCoords = {
            sx : this.shape.attr("cx"),
            sy : this.shape.attr("cy"),
            tx : this.text.attr("x"),
            ty : this.text.attr("y"),
            sbx : this.shapeSelectionBox.attr("x"),
            sby : this.shapeSelectionBox.attr("y"),
            tbx : this.textSelectionBox.attr("x"),
            tby : this.textSelectionBox.attr("y"),
        };
    }

    onMove(dx,dy){
        if(this.editTextPos){
            this.textOnMove(dx,dy);
            return;
        }
        this.shape.attr({cx:this.startCoords.sx+dx,cy:this.startCoords.sy+dy});
        this.text.attr({x:this.startCoords.tx+dx,y:this.startCoords.ty+dy});

        this.shapeSelectionBox.attr({x:this.startCoords.sbx+dx,y:this.startCoords.sby+dy});
        this.textSelectionBox.attr({x:this.startCoords.tbx+dx,y:this.startCoords.tby+dy});

    }

    nameChanged(newName) {
        this.text.attr({text:newName});
        this.textSelectionBox.remove();
        this.textSelectionBox = getRectFromElement(this.text);
    }

    elementDeleted() {
        this.text.remove();
        this.shape.remove();
        points.splice(points.indexOf(this),1);
    }

    moveUp(){
        let i = points.indexOf(this);
        if(i < points.length-1){
            [points[i],points[i+1]] = [points[i+1],points[i]];
        }
    }

    moveDown() {
        let i = points.indexOf(this);
        if(i > 0){
            [points[i],points[i-1]] = [points[i-1],points[i]];
        }
    }
}

function applyDiff(square,x,y){
    return {x : square.attrs.x+x, y: square.attrs.y+y};
}

function getMiddlePoint(p1,p2){
    let p1l = p1.length;
    let p2l = p2.length;
    return {
        x: (p1[p1l-2] + p2[p2l-2])/2,
        y: (p1[p1l-1] + p2[p2l-1])/2
    }
}

class LineElement extends Element{
    constructor(shape, text){
        super(shape,text);
        this.path = shape.attr("path");
        this.currentSquare = null;
        this.pointSet = paper.set();
    }


    unselectSquare(){
        if(this.currentSquare != null){
            this.currentSquare.selSquare.remove();
            if(this.currentSquare.curveCircle != null){
                this.currentSquare.curveCircle.remove();
                this.currentSquare.curveCircle = null;
            }
            this.currentSquare = null;
            deleteSegmentButton.disabled = true;
            modCurve.disabled = true;
        }
    }

    selectSquare(pathPoint, sq){
        this.unselectSquare();
        let squareOfSelection = paper.rect(sq.attrs.x-5,sq.attrs.y-5,sq.attrs.width+10,sq.attrs.height+10);
        this.currentSquare = { pointInPath: pathPoint, square: sq, selSquare: squareOfSelection, pathIndex : this.path.indexOf(pathPoint)};
        deleteSegmentButton.disabled = false;
        modCurve.disabled = false;
        if(pathPoint[0] === 'L'){
            modCurve.innerHTML = "Add curve";
        }else if(pathPoint[0] === 'Q'){
            modCurve.innerHTML = "Modify curve";
        }
    }

    addSquare(element,x,y){
        let tThis = this;
        let sqr = paper.rect(x-5,y-5,10,10).attr({fill:"black",'fill-opacity':'0.0'})
            .drag(currentAction.onMovement,currentAction.enterMovement)
            .dblclick(function(){tThis.selectSquare(element,this)});
        this.pointSet.push(sqr);
    }


    selectPath(){
        let tThis = this;
        if(currentAction instanceof EditElementAction){
            this.path.forEach(
                function(element){
                    let len = element.length;
                    tThis.addSquare(element,element[len-2],element[len-1]);
                }
            );
        }else{
            this.shape.attrs.path.forEach(
                function(element){
                    paper.rect(element[1]-5,element[2]-5,10,10).attr({fill:"black"});
                }
            );
        }
    }

    removePathSelection(){
        while(this.pointSet.length > 0){
            this.pointSet.pop().remove();
        }
    }

    elementSelected() {
        super.elementSelected();
        this.textSelectionBox = getRectFromElement(this.text);
        this.selectPath();
        addSegmentButton.disabled = false;

        strokeWidthChooser.showPanel();
        if(this.shape.attrs.hasOwnProperty('stroke-width')){
            strokeWidthChooser.setValue(this.shape.attrs['stroke-width']);
        }else{
            strokeWidthChooser.setValue(1);
        }
        strokeWidthChooser.setOnSizeChangeFunction(this,function(context){
            context.shape.attr({'stroke-width': this.getValue()});
        });

        strokeColorChooser.showPanel();
        strokeColorChooser.setColor(this.shape.attrs.stroke);
        strokeColorChooser.setOnColorChangeFunction(this,function(context){
            context.shape.attr({stroke: this.getColorRGBValue()});
        });

    }

    selectionRemoved() {
        super.selectionRemoved();
        this.textSelectionBox.remove();
        this.unselectSquare();
        this.removePathSelection();
        strokeWidthChooser.hidePanel();
        strokeColorChooser.hidePanel();
        addSegmentButton.disabled = true;
    }

    onMovePoint(dx, dy){
        let ndx = dx - this.ld.x;
        let ndy = dy - this.ld.y;
        let len = this.currentSquare.pointInPath.length;
        this.currentSquare.pointInPath[len-2] += ndx;
        this.currentSquare.pointInPath[len-1] += ndy;
        if(this.currentSquare.pointInPath[0] === 'Q'){
            this.currentSquare.pointInPath[1] += ndx;
            this.currentSquare.pointInPath[2] += ndy;
        }
        this.path[this.currentSquare.pathIndex] = this.currentSquare.pointInPath;
        this.shape.attr({path: this.path});
        this.currentSquare.square.attr(applyDiff(this.currentSquare.square,ndx,ndy));
        this.currentSquare.selSquare.attr(applyDiff(this.currentSquare.selSquare,ndx, ndy));
        this.ld.x = dx;
        this.ld.y = dy;
    }

    moveStart() {
        if(this.editTextPos){
            this.textMoveStart();
            return;
        }
        this.ld = {x: 0, y: 0};
    }

    onMove(dx,dy) {
        if(this.editTextPos){
            this.textOnMove(dx,dy);
            return;
        }
        if(this.currentSquare != null){
            this.onMovePoint(dx,dy);
            return;
        }
        let ndx = dx - this.ld.x;
        let ndy = dy - this.ld.y;
        this.text.attr(applyDiff(this.text,ndx,ndy));
        this.textSelectionBox.attr(applyDiff(this.textSelectionBox,ndx,ndy));
        let i = 0;
        let tThis = this;
        this.pointSet.forEach(
            function(el){
                let len = tThis.path[i].length;
                tThis.path[i][len-2] += ndx;
                tThis.path[i][len-1] += ndy;
                if(tThis.path[i][0] === 'Q'){
                    tThis.path[i][1] += ndx;
                    tThis.path[i][2] += ndy;
                }
                el.attr(applyDiff(el,ndx,ndy));
                i++;
            }
        );
        this.shape.attr({path:tThis.path});
        this.ld.x = dx;
        this.ld.y = dy;

    }

    nameChanged(newName) {
        this.text.attr({text:newName});
        this.textSelectionBox.remove();
        this.textSelectionBox = getRectFromElement(this.text);
    }

    elementDeleted() {
        this.text.remove();
        this.shape.remove();
        lines.splice(lines.indexOf(this),1);
    }

    moveUp(){
        let i = lines.indexOf(this);
        if(i < lines.length-1){
            [lines[i],lines[i+1]] = [lines[i+1],lines[i]];
        }
    }

    moveDown() {
        let i = lines.indexOf(this);
        if(i > 0){
            [lines[i],lines[i-1]] = [lines[i-1],lines[i]];
        }
    }

    startAddingSegments() {
        let point = this.path[this.path.length-1];
        this.circle = paper.circle(point[point.length-2],point[point.length-1],10);
    }

    segmentAdded(x, y) {
        let element = ['L',x,y];
        this.path.push(element);
        this.addSquare(element,x,y);
        this.shape.attr({path:this.path});
        this.circle.attr({cx:x,cy:y});
    }

    stopAddingSegments() {
        this.circle.remove();
    }

    removePathSegment() {
        if(this.currentSquare != null){
            this.pointSet.exclude(this.currentSquare.square);
            this.currentSquare.square.remove();
            if(this.currentSquare.pointInPath[0] === 'M'){
                let next = this.path[this.currentSquare.pathIndex+1];
                this.path[this.currentSquare.pathIndex+1] = ['M',next[next.length-2],next[next.length-1]];
            }
            this.path.splice(this.currentSquare.pathIndex,1);
            this.shape.attr({path:this.path});
            this.unselectSquare();
        }
    }

    modifyCurve(){
        if(this.currentSquare != null){
            if(this.currentSquare.curveCircle != null){
                if(this.currentSquare.pointInPath[0] === 'Q'){
                    let len = this.currentSquare.pointInPath.length;
                    this.currentSquare.pointInPath = ['L',this.currentSquare.pointInPath[len-2],this.currentSquare.pointInPath[len-1]];
                    this.path[this.currentSquare.pathIndex] = this.currentSquare.pointInPath;
                    this.shape.attr({path:this.path});
                    this.currentSquare.curveCircle.remove();
                    this.currentSquare.curveCircle = null;
                    modCurve.innerHTML = "Add curve";
                }
                return;
            }
            if(this.currentSquare.pointInPath[0] === 'L'){
                let previousPoint = this.path[this.currentSquare.pathIndex-1];
                let middle = getMiddlePoint(this.currentSquare.pointInPath,previousPoint);
                this.currentSquare.pointInPath = ['Q',middle.x,middle.y,this.currentSquare.pointInPath[1],this.currentSquare.pointInPath[2]];
                this.path[this.currentSquare.pathIndex] = this.currentSquare.pointInPath;
                let tThis = this;
                this.currentSquare.curveCircle = paper.circle(middle.x,middle.y,5).attr({fill:"black",'fill-opacity':'0.0',stroke:"black"})
                    .drag(
                        function(dx,dy) {
                            let ndx = dx - this.ld.x;
                            let ndy = dy - this.ld.y;
                            this.attr({cx : this.attrs.cx+ndx, cy : this.attrs.cy+ndy});
                            tThis.currentSquare.pointInPath[1] = this.attrs.cx;
                            tThis.currentSquare.pointInPath[2] = this.attrs.cy;
                            tThis.path[tThis.currentSquare.pathIndex] = tThis.currentSquare.pointInPath;
                            tThis.shape.attr({path:tThis.path});
                            this.ld.x = dx;
                            this.ld.y = dy;
                        },
                        function() {
                            this.ld = {x: 0, y: 0};
                            dragging = true;
                        },
                        function(){
                            dragStop = true;
                        }
                    );
                modCurve.innerHTML = "Remove curve";
            }else if(this.currentSquare.pointInPath[0] === 'Q'){
                let tThis = this;
                let point = this.currentSquare.pointInPath;
                this.currentSquare.curveCircle = paper.circle(point[1],point[2],5).attr({fill:"black",'fill-opacity':'0.0',stroke:"black"})
                    .drag(
                        function(dx,dy) {
                            let ndx = dx - this.ld.x;
                            let ndy = dy - this.ld.y;
                            this.attr({cx : this.attrs.cx+ndx, cy : this.attrs.cy+ndy});
                            tThis.currentSquare.pointInPath[1] = this.attrs.cx;
                            tThis.currentSquare.pointInPath[2] = this.attrs.cy;
                            tThis.path[tThis.currentSquare.pathIndex] = tThis.currentSquare.pointInPath;
                            tThis.shape.attr({path:tThis.path});
                            this.ld.x = dx;
                            this.ld.y = dy;
                        },
                        function() {
                            this.ld = {x: 0, y: 0};
                            dragging = true;
                        },
                        function(){
                            dragStop = true;
                        }
                    );
                modCurve.innerHTML = "Remove curve";
            }
        }
    }
}

class AreaElement extends LineElement{

    constructor(shape, text){
        super(shape, text);
    }


    selectPath(){
        super.selectPath();
        fillColorChooser.showPanel();
        fillColorChooser.setColor(this.shape.attrs.fill);
        fillColorChooser.setOnColorChangeFunction(this,function(context){
            context.shape.attr({fill: this.getColorRGBValue()});
        });
        this.pointSet.pop().remove();
    }

    selectionRemoved() {
        fillColorChooser.hidePanel();
        super.selectionRemoved();
    }


    elementDeleted() {
        this.text.remove();
        this.shape.remove();
        areas.splice(areas.indexOf(this),1);
    }

    moveUp(){
        let i = areas.indexOf(this);
        if(i < areas.length-1){
            [areas[i],areas[i+1]] = [areas[i+1],areas[i]];
        }
    }

    moveDown() {
        let i = areas.indexOf(this);
        if(i > 0){
            [areas[i],areas[i-1]] = [areas[i-1],areas[i]];
        }
    }

    startAddingSegments() {
        let point = this.path[this.path.length-2];
        this.circle = paper.circle(point[point.length-2],point[point.length-1],10);
    }

    segmentAdded(x, y) {
        let element = ['L',x,y];
        this.path.splice(this.path.length-1,0,element);
        this.addSquare(element,x,y);
        this.shape.attr({path:this.path});
        this.circle.attr({cx:x,cy:y});
    }

}

class ButtonAction {
    constructor(elementId){
        this.element = document.getElementById(elementId);
    }

    actionName() {
        return "Undefined";
    }

    screenClicked(x, y){}
    fieldHover(x, y) {
        actionDescriptor.html(this.actionName() + " X: " + x + " Y:" + y);
    }

    screenDrag(dx,dy){
    }

    screenDragStart() {}

    enterPressed() {}
    actionSelected(){
        actionDescriptor.html(this.actionName());
    }
    selectionRemoved(){}
    nameAdded(value){}
    elementSelected(element) {}

    addSegmentPressed() {}
}

class MoveMapAction extends ButtonAction{

    actionName() {
        return "Map movement.";
    }

    screenDragStart(){
        this.lastd = {x: 0,y: 0};
    }

    screenDrag(dx,dy){
        let viewBox = paper._viewBox;
        paper.setViewBox(viewBox[0]-(dx-this.lastd.x),viewBox[1]-(dy-this.lastd.y),500,500);
        this.lastd.x = dx;
        this.lastd.y = dy;
    }

    selectionRemoved(){
        mapRect.undrag();
    }
}

class AddPointAction extends ButtonAction {
    constructor(element){
        super(element);
        this.circle = null;
    }

    setDescriptorAfterChoosing(){
        actionDescriptor.html("Point added at x:" + this.circle.attrs.cx + " y: " + this.circle.attrs.cy + ". Enter name.");
    }

    fieldHover(x, y) {
        if(nameField.active){
            this.setDescriptorAfterChoosing();
        }else {
            super.fieldHover(x, y);
        }
    }

    actionName() {
        return "Adding point.";
    }

    screenClicked(x, y){
        this.circle = paper.circle(x,y,10).attr({fill:"green"});
        this.setDescriptorAfterChoosing();
        nameField.begin();
    }

    selectionRemoved(){
        if(this.circle != null){
            this.circle.remove();
            this.circle = null;
        }
    }

    nameAdded(value){
        let text = paper.text(this.circle.attr("cx"),this.circle.attr("cy")-20,value);
        insertPoint(this.circle);
        insertText(text);
        points.push(addListeners(new PointElement(this.circle,text)));
        this.circle = null;
        actionDescriptor.html("Point \"" + value + "\" added.");
    }

}

class AddLineAction extends ButtonAction {
    constructor(element){
        super(element);
        this.pathArray = null;
        this.path = null;
        this.pathCircle = null;
    }

    fieldLastPointDescriptor(x,y){
        let li = this.pathArray.length - 1;
        if(x == null || y == null){
            actionDescriptor.html("Last point of line at: " + this.pathArray[li][1] + ", " + this.pathArray[li][2]
                                        + ". Press enter to stop.");
        }else{
            actionDescriptor.html("Last point of line at: " + this.pathArray[li][1] + ", " + this.pathArray[li][2] +
                ". Current coordinates X: " + x + " Y:" + y + ". Press enter to stop.");
        }
    }

    static fieldEndPath(){
        actionDescriptor.html("Ended building path. Enter name.");
    }


    fieldHover(x,y){
        if(this.path == null){
            super.fieldHover(x,y);
        }else if(nameField.active){
            AddLineAction.fieldEndPath();
        }else {
            this.fieldLastPointDescriptor(x,y);
        }
    }

    actionName() {
        return "Adding line.";
    }

    screenClicked(x, y){
        if(this.path == null){
            this.pathArray = [ ['M',x,y] ];
            this.path = paper.path(this.pathArray);
            this.pathCircle = paper.circle(x,y,10);
            this.fieldLastPointDescriptor();
        }else{
            this.pathArray.push(['L',x,y]);
            this.path.attr({path:this.pathArray});
            this.pathCircle.attr({cx:x,cy:y});
            this.fieldLastPointDescriptor();
        }
    }

    selectionRemoved(){
        if(this.pathCircle != null){
            this.pathCircle.remove();
            this.pathCircle = null;
        }
        if(this.path != null){
            this.path.remove();
            this.path = null;
        }
        this.pathArray = null;
    }

    enterPressed(){
        if(this.pathCircle != null){
            this.pathCircle.remove();
            this.pathCircle = null;
        }
        if(this.path == null)
            return;
        AddLineAction.fieldEndPath();
        nameField.begin();
    }

    nameAdded(value){
        let text = paper.text(0,0,value);
        let textBbox = text.getBBox();
        let middle = this.path.getPointAtLength(this.path.getTotalLength()/2);
        let textPos = calculateTextPosition(middle.x,middle.y,middle.alpha,textBbox.width,textBbox.height);

        text.attr(textPos);
        insertLine(this.path);
        insertText(text);
        lines.push(addListeners(new LineElement(this.path,text)));
        this.path = null;
        this.pathArray = null;
        actionDescriptor.html("Element \"" + value + "\" added.");
    }

}

class AddAreaAction extends AddLineAction {
    constructor(element){
        super(element);
    }

    actionName() {
        return "Adding area.";
    }

    enterPressed(){
        super.enterPressed();
        this.pathArray.push(["Z"]);
        this.path.attr({path:this.pathArray,fill:"cyan"});
    }

    nameAdded(value){
        let areaBox = this.path.getBBox();
        let text = paper.text(areaBox.cx,areaBox.cy,nameInput.value);
        insertArea(this.path);
        insertText(text);
        areas.push(addListeners(new AreaElement(this.path,text)));
        this.path = null;
        this.pathArray = null;
    }
}

class EditElementAction extends ButtonAction{
    constructor(element){
        super(element);
        this.currentSelection = null;
        this.isElementSelected = false;
        this.isElementDragged = false;
        this.addingSegments = false;
    }

    actionName() {
        return "Editing element ";
    }

    descriptorSelectedItem(){
        actionDescriptor.html("Selected element: " + this.currentSelection.text.attr("text"));
    }

    fieldHover(x, y) {
        if(this.currentSelection != null){
            this.descriptorSelectedItem();
        }else{
            super.fieldHover(x, y);
        }
    }

    selectionRemoved(){
        this.removeSelection();
    }

    screenClicked(x,y){
        if(this.addingSegments && (this.currentSelection != null)){
            this.currentSelection.segmentAdded(x,y);
            return;
        }
        if(!this.isElementSelected && !this.isElementDragged){
            if(!dragging){
                this.removeSelection();
            }
            if(dragStop){
                dragging = false;
                dragStop = false;
            }
        }else{
            this.isElementSelected = false;
            this.isElementDragged = false;
        }
    }

    selectElement(){

        let currentSelection = this.currentSelection;
        let tThis = this;

        this.enterMovement = function() { tThis.isElementDragged = true; currentSelection.moveStart();};
        this.onMovement = function(dx,dy) { tThis.isElementDragged = true; currentSelection.onMove(dx,dy);};

        this.currentSelection.shape.drag(this.onMovement,this.enterMovement);
        this.currentSelection.text.drag(this.onMovement,this.enterMovement)
            .dblclick(function(){tThis.textDoubleClicked()});

        this.currentSelection.elementSelected();

        nameInput.disabled = false;
        nameInput.value = currentSelection.text.attr("text");
        this.descriptorSelectedItem();
        this.isElementSelected = true;

        hierarchyMovement.activate(currentSelection);
    }

    removeSelection(){
        hierarchyMovement.deactivate();
        this.stopAddingElements();
        if(this.currentSelection != null){
            this.currentSelection.selectionRemoved();
            this.currentSelection.shape.undrag();
            this.currentSelection.text.undrag();
            // noinspection JSUnresolvedFunction
            this.currentSelection.text.undblclick();
            this.currentSelection = null;
            actionDescriptor.html("");
            nameInput.disabled = true;
        }
    }

    nameAdded(value){
        if(this.currentSelection != null){
            this.currentSelection.nameChanged(value);
        }
    }

    stopAddingElements(){
        if(this.addingSegments === true){
            this.currentSelection.stopAddingSegments();
            this.addingSegments = false;
        }
    }

    enterPressed() {
        this.stopAddingElements();
    }

    elementSelected(element) {
        if(this.addingSegments){
            return;
        }
        if(element === this.currentSelection){
            this.isElementSelected = true;
            return;
        }
        this.removeSelection();
        this.currentSelection = element;
        this.selectElement();
    }

    addSegmentPressed() {
        if(this.addingSegments){
            return;
        }
        if(this.currentSelection != null){
            this.currentSelection.startAddingSegments();
            this.addingSegments = true;
        }
    }

    removeSegment(){
        if(this.currentSelection != null){
            this.currentSelection.removePathSegment();
        }
    }

    textDoubleClicked(){
        this.currentSelection.textDblClick();
    }


    modifyCurveForPoint(){
        if(this.currentSelection instanceof LineElement){
            this.currentSelection.modifyCurve();
        }
    }
}

function loadMap(mapDetails){

    mapRect.attr({width: mapDetails.width, height: mapDetails.height});


    mapDetails.areas.forEach(
        function(line){
            let pathArray = [];
            line.path.forEach( function(ps) {
                // noinspection JSUnresolvedVariable
                let segmentArray = [ps.instruction];
                pathArray.push(segmentArray.concat(ps.params));
            });
            let areaShape = paper.path(pathArray).attr({fill:"cyan"});
            if(line.style != null){
                areaShape.attr(line.style.styleMap);
            }
            let text = paper.text(line.name.x,line.name.y,line.name.value);
            if(line.name.style != null){
                text.attr(line.name.style.styleMap);
            }
            insertArea(areaShape);
            insertText(text);
            areas.push(addListeners(new AreaElement(areaShape,text)));
        }
    );


    mapDetails.lines.forEach(
        function(line){
            let pathArray = [];
            line.path.forEach( function(ps) {
                // noinspection JSUnresolvedVariable
                let segmentArray = [ps.instruction];
                pathArray.push(segmentArray.concat(ps.params));
            });
            let lineShape = paper.path(pathArray);
            if(line.style != null){
                lineShape.attr(line.style.styleMap);
            }
            let text = paper.text(line.name.x,line.name.y,line.name.value);
            if(line.name.style != null){
                text.attr(line.name.style.styleMap);
            }
            insertLine(lineShape);
            insertText(text);
            lines.push(addListeners(new LineElement(lineShape,text)));
        }
    );

    mapDetails.points.forEach(
        function(point){
            let pointShape = paper.circle(point.x,point.y,10).attr({fill:"green"});
            if(point.style != null){
                pointShape.attr(point.style.styleMap);
            }
            let text = paper.text(point.name.x,point.name.y,point.name.value);
            if(point.name.style != null){
                text.attr(point.name.style.styleMap);
            }
            insertPoint(pointShape);
            insertText(text);
            points.push(addListeners(new PointElement(pointShape,text)));
        }
    );
}

function getTextStyle(element){
    return {
        'font-size' : element.text.attr('font-size'),
        'fill' : element.text.attr('fill')
    }
}

function getData(){
    let mapData = {
        width : mapRect.attrs.width,
        height : mapRect.attrs.height,
        points : [],
        lines : [],
        areas : [],
     };



     points.forEach(function (point) {
         mapData.points.push(
             {
                 px : point.shape.attr("cx"),
                 py : point.shape.attr("cy"),
                 name : point.text.attr("text"),
                 tx : point.text.attr("x"),
                 ty : point.text.attr("y"),
                 style : {
                     point : {
                         stroke : point.shape.attr("stroke"),
                         fill : point.shape.attr("fill"),
                         r : point.shape.attr("r")
                     },
                     text : getTextStyle(point)
                 }
             }
         );
     });
     lines.forEach(function (line) {
         mapData.lines.push(
             {
                 path : line.shape.attr("path"),
                 name : line.text.attr("text"),
                 tx : line.text.attr("x"),
                 ty : line.text.attr("y"),
                 style : {
                     line : {
                         'stroke-width' : line.shape.attrs.hasOwnProperty('stroke-width')
                                ? line.shape.attrs['stroke-width'] :  1,
                         stroke : line.shape.attr("stroke")
                     },
                     text : getTextStyle(line)
                 }
             }
         );
     });
     areas.forEach(function (area) {
         mapData.areas.push(
             {
                 path : area.shape.attr("path"),
                 name : area.text.attr("text"),
                 tx : area.text.attr("x"),
                 ty : area.text.attr("y"),
                 style : {
                     area : {
                         'stroke-width' : area.shape.attrs.hasOwnProperty('stroke-width')
                             ? area.shape.attrs['stroke-width'] :  1,
                         stroke : area.shape.attr("stroke"),
                         fill : area.shape.attr("fill")
                     },
                     text : getTextStyle(area)
                 }
             }
         );
     });
     return mapData;
}

function elementClicked(element){
    if(currentAction == null)
        return;
    currentAction.elementSelected(element);
}

function addListeners(element){
    element.text.click(function elementCl(){elementClicked(element);});
    element.shape.click(function elementCl2(){elementClicked(element);});
    return element;
}

/*
UIElements = {
    area {
        id: ""
        width : 0
        height : 0
    },
    nameInput : id,
    buttons : {
        addPoint = id,
        addLine = id,
        addArea = id,
        editElement = id,
        deleteElement = id,
        moveMap = id,
        saveMap = id,
        addSegment: "addSegment",
        deleteSegment: "deleteSegment",
        curveMod: "curveMod",
        setMapSize: id,
        enter : id
    }
    mapHeight : id,
    mapWidth : id,
    elementStyle : {
        strokeColor : {
            panel : "strokeColor",
            chooser : "strokeColorChooser"
        },
        fillColor : {
            panel : "fillColor",
            chooser : "fillColorChooser"
        },
        pointSize : {
            panel : "pointSize",
            chooser : "pointSizeChooser",
            button : "pointSizeButton"
        },
        strokeWidth : {
            panel : "strokeWidth",
            chooser : "strokeWidthChooser",
            button : "strokeWidthButton",
        },
        textSize : {
            panel : "textSize",
            chooser : "textSizeChooser",
            button : "textSizeButton"
        },
        textColor : {
            panel : "textColor",
            chooser : "textColorChooser",
        }
    },
    actionDescription : "actionDescription"
}
*/
function initMapEditor(UIElements){

    paper = Raphael(UIElements.area.id,UIElements.area.width,UIElements.area.height);
    paper.setViewBox(0,0,paper.width,paper.height);
    mapRect = paper.rect(0,0,paper.width,paper.height).attr({fill:"white"});

    nameInput = document.getElementById(UIElements.nameInput);

    areaTab = paper.circle(0,0,0).hide().data("tab","area");
    lineTab = paper.circle(0,0,0).hide().data("tab","line");
    pointTab = paper.circle(0,0,0).hide().data("tab","point");
    textTab = paper.circle(0,0,0).hide().data("tab","text");


    nameField = {
        input : nameInput,
        active : false,
        begin : function() {
            this.input.disabled = false;
            this.input.focus();
            this.input.select();
            this.active = true;
        },
        end : function() {
            this.input.disabled = true;
            this.active = false;
        },
        getValue : function() { return this.input.value; }
    };

    $(nameInput).focusout(function (){
        if(nameField.active){
            nameInput.focus();
        }
    });

    class DeleteElementAction extends ButtonAction {
        constructor(element){
            super(element);
        }

        actionName() {
            return "Deleting element. ";
        }

        actionSelected(){}


        elementSelected(element) {
            if(confirm("Delete element " + element.text.attr("text") + "?")){
                element.elementDeleted();
            }
        }
    }


    $(document).keypress(function (e){
        if(e.which === 13){
            if(currentAction != null){
                currentAction.enterPressed();
            }
        }
    });


    $(nameInput).keypress(function (e){
        if(e.which === 13){
            if(/\S/.test(nameInput.value)){
                if(currentAction != null){
                    currentAction.nameAdded(nameField.getValue());
                    if(!(currentAction instanceof EditElementAction)){
                        nameField.end();
                    }
                }
            }else{
                alert("Name field is empty.");
            }
            return false;
        }
    });

    let btn = UIElements.buttons;



    let actionArray = [
        new MoveMapAction(btn.moveMap),
        new AddPointAction(btn.addPoint),
        new AddLineAction(btn.addLine),
        new AddAreaAction(btn.addArea),
        new EditElementAction(btn.editElement),
        new DeleteElementAction(btn.deleteElement)
    ];


    addSegmentButton = document.getElementById(btn.addSegment);
    deleteSegmentButton = document.getElementById(btn.deleteSegment);
    modCurve = document.getElementById(btn.curveMod);

    hierarchyMovement = new HierarchyMovement(btn.moveUp,btn.moveDown);

    enterButton = $("#" + btn.enter);
    $(enterButton).click(function(){
        if(currentAction != null && currentAction instanceof  EditElementAction){
            if(currentAction.addingSegments){
                currentAction.stopAddingElements();
            }else{
                if(/\S/.test(nameInput.value)){
                    if(currentAction != null){
                        currentAction.nameAdded(nameField.getValue());
                        nameField.end();
                    }
                }else{
                    alert("Name field is empty.");
                }
            }
        }else if(nameField.active){
            if(/\S/.test(nameInput.value)){
                if(currentAction != null){
                    currentAction.nameAdded(nameField.getValue());
                    nameField.end();
                }
            }else{
                alert("Name field is empty.");
            }
        }else{
            currentAction.enterPressed();
        }
    });


    $(addSegmentButton).click(function(){
        currentAction.addSegmentPressed();
    });

    $(modCurve).click(function(){
        if(currentAction instanceof EditElementAction){
            currentAction.modifyCurveForPoint();
        }
    });

    $(deleteSegmentButton).click(function(){
        if(currentAction instanceof EditElementAction){
            currentAction.removeSegment();
        }
    });

    let styleElement = UIElements.elementStyle;

    strokeColorChooser = new ColorChooser(styleElement.strokeColor.panel,
                                            styleElement.strokeColor.chooser);

    fillColorChooser = new ColorChooser(styleElement.fillColor.panel,
                                            styleElement.fillColor.chooser);

    pointSizeChooser = new SizeChooser(styleElement.pointSize.panel,
                                            styleElement.pointSize.chooser,
                                            styleElement.pointSize.button);

    strokeWidthChooser = new SizeChooser(styleElement.strokeWidth.panel,
                                            styleElement.strokeWidth.chooser,
                                            styleElement.strokeWidth.button);

    textSizeChooser = new SizeChooser(styleElement.textSize.panel,
                                        styleElement.textSize.chooser,
                                        styleElement.textSize.button);

    textColorChooser = new ColorChooser(styleElement.textColor.panel,
        styleElement.textColor.chooser);

    actionArray.forEach(function (action) {
        $(action.element).click(function() {
                if(currentAction != null){
                    currentAction.selectionRemoved();
                    currentAction.element.disabled = false;
                }
                nameField.end();
                currentAction = action;
                currentAction.actionSelected();
                this.disabled = true;
            }
        );
    });

    currentAction = actionArray[0];


    let area = $("#"+UIElements.area.id);

    let dragging = false;
    let dragX = 0;
    let dragY = 0;
    area.mousedown(function(event){
        dragging = true;
        dragX = event.pageX - $(this).position().left;
        dragY = event.pageY - $(this).position().top;
        currentAction.screenDragStart();
    }).mouseup(function(){
        dragging = false;
    }).mouseleave(function(){
        dragging = false;
    });

    area.click(function (event) {
        let posX = event.pageX - $(this).position().left;
        let posY = event.pageY - $(this).position().top;

        if(nameField.active)
            return;
        if(posX > paper.width)
            return;
        if(currentAction == null){
            alert("Choose action.");
            return;
        }
        posX +=  paper._viewBox[0];
        posY +=  paper._viewBox[1];
        currentAction.screenClicked(posX,posY);
    });

    area.mousemove(function (event){
        let posX = event.pageX - $(this).position().left;
        let posY = event.pageY - $(this).position().top;
        if(posX > paper.width)
            return;
        if(currentAction == null){
            return 0;
        }

        if(dragging){
            currentAction.screenDrag(posX-dragX,posY-dragY);
        }

        posX +=  paper._viewBox[0];
        posY +=  paper._viewBox[1];

        currentAction.fieldHover(posX,posY);
    });



    actionDescriptor = $("#" + UIElements.actionDescription);


    let mapWidth = $("#" + UIElements.mapWidth);
    let mapHeight = $("#" + UIElements.mapHeight);
    $("#" + UIElements.buttons.setMapSize).click(function(){
        mapRect.attr({width: mapWidth.val(),height: mapHeight.val()});
    });




    $("#"+UIElements.saveMap).submit(function () {
        $("<input />").attr('type','hidden')
                .attr('name','mapData')
                .attr('value', JSON.stringify(getData()))
            .appendTo(this);
        return true;
    });


}