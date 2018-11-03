package pl.rosa.mapeditor.exceptions;

/**
 * Created by Maciej on 2018-11-03 10:29
 */
public class AppUserNotLoggedInException extends Exception {

    @Override
    public String getMessage() {
        return "User is not logged in.";
    }
}
